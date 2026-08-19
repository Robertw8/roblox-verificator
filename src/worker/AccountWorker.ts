import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Logger } from "pino";
import type { Browser, BrowserContext, Page } from "playwright";
import type { Config } from "../config.js";
import {
  awaitVerificationOutcome,
  startSelfieVerification,
} from "../roblox/ageVerification.js";
import { login } from "../roblox/login.js";
import { logout } from "../roblox/logout.js";
import {
  openAccountSettings,
  openAgeVerificationSection,
} from "../roblox/settings.js";
import type { Account, AccountState, VerificationResult } from "../types.js";
import { ShutdownError, normalizeError } from "../utils/errors.js";
import type { ProgressStore } from "../storage/progressStore.js";
import { canTransition } from "./state.js";

function safeName(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
}

function timestampForFile(): string {
  return new Date().toISOString().replace(/[-:.]/g, "");
}

function latestOpenPage(context: BrowserContext): Page | undefined {
  return [...context.pages()].reverse().find((page) => !page.isClosed());
}

export class AccountWorker {
  public constructor(
    private readonly browser: Browser,
    private readonly config: Config,
    private readonly progressStore: ProgressStore,
    private readonly logger: Logger,
    private readonly isShutdownRequested: () => boolean,
  ) {}

  public async process(
    account: Account,
    attempt: number,
  ): Promise<VerificationResult> {
    if (this.isShutdownRequested()) throw new ShutdownError();

    let context: BrowserContext | undefined;
    let tracingStarted = false;
    let failed = false;
    try {
      context = await this.browser.newContext({
        viewport: { width: 1365, height: 900 },
        locale: "en-US",
      });
      context.setDefaultTimeout(this.config.navigationTimeoutMs);
      context.setDefaultNavigationTimeout(this.config.navigationTimeoutMs);
      if (this.config.traceOnFailure) {
        await context.tracing.start({
          screenshots: true,
          snapshots: true,
          sources: true,
        });
        tracingStarted = true;
      }

      const page = await context.newPage();
      await this.transition(account.username, "LOGIN", {
        attempts: attempt,
        clearError: true,
      });
      await login(
        page,
        account,
        this.config.loginTimeoutMs,
        this.logger,
        this.isShutdownRequested,
      );

      await this.transition(account.username, "OPEN_SETTINGS");
      await openAccountSettings(page, this.config.navigationTimeoutMs);

      await this.transition(account.username, "OPEN_AGE_VERIFICATION");
      await openAgeVerificationSection(
        page,
        this.config.navigationTimeoutMs,
        this.isShutdownRequested,
      );

      await this.transition(account.username, "START_VERIFICATION");
      const session = await startSelfieVerification(
        page,
        this.config.navigationTimeoutMs,
        this.isShutdownRequested,
      );

      await this.transition(account.username, "WAITING_FOR_HUMAN");
      if (!session.immediateResult) {
        this.logger.warn(
          { username: account.username, state: "WAITING_FOR_HUMAN" },
          "Selfie verification is ready. Complete the camera verification manually in the browser. Automation will continue automatically after completion.",
        );
      }

      const result = await awaitVerificationOutcome(
        session,
        this.config.humanVerificationTimeoutMs,
        this.config.resultTimeoutMs,
        async () => this.transition(account.username, "WAITING_FOR_RESULT"),
        this.isShutdownRequested,
      );

      if (
        result.status === "verified" ||
        result.status === "already_verified"
      ) {
        await this.transition(account.username, "VERIFIED");
        this.logger.info(
          {
            username: account.username,
            state: "VERIFIED",
            ageGroup: result.ageGroup,
          },
          "VERIFIED",
        );
      } else {
        await this.transition(account.username, "FAILED", {
          lastError: result.status,
        });
      }

      await this.transition(account.username, "LOGOUT");
      await logout(page, this.config.navigationTimeoutMs, this.logger);
      await this.transition(account.username, "DONE");

      if (tracingStarted) {
        await context.tracing.stop();
        tracingStarted = false;
      }
      return result;
    } catch (caught) {
      failed = true;
      const error = normalizeError(caught);
      if (context && !(error instanceof ShutdownError)) {
        await this.captureFailure(account.username, context, error.code);
        const current = this.progressStore.get(account.username);
        if (
          current &&
          current.state !== "FAILED" &&
          canTransition(current.state, "FAILED")
        ) {
          await this.transition(account.username, "FAILED", {
            lastError: error.code,
          });
        }

        const page = latestOpenPage(context);
        const afterFailure = this.progressStore.get(account.username);
        if (
          page &&
          afterFailure &&
          canTransition(afterFailure.state, "LOGOUT")
        ) {
          await this.transition(account.username, "LOGOUT");
          await logout(page, this.config.navigationTimeoutMs, this.logger);
        }
      }
      throw error;
    } finally {
      if (context) {
        if (tracingStarted) {
          try {
            if (failed) {
              await mkdir(this.config.tracesDir, { recursive: true });
              const tracePath = join(
                this.config.tracesDir,
                `${safeName(account.username)}_${timestampForFile()}.zip`,
              );
              await context.tracing.stop({ path: tracePath });
            } else {
              await context.tracing.stop();
            }
          } catch (error) {
            this.logger.warn(
              {
                username: account.username,
                error: error instanceof Error ? error.message : String(error),
              },
              "Could not save Playwright trace",
            );
          }
        }
        await context.close().catch(() => undefined);
      }
    }
  }

  private async transition(
    username: string,
    state: AccountState,
    options: {
      attempts?: number;
      lastError?: string;
      clearError?: boolean;
    } = {},
  ): Promise<void> {
    await this.progressStore.transition(username, state, options);
    this.logger.info({ username, state }, `${state} started`);
  }

  private async captureFailure(
    username: string,
    context: BrowserContext,
    errorCode: string,
  ): Promise<void> {
    const page = latestOpenPage(context);
    const state = this.progressStore.get(username)?.state ?? "PENDING";
    const url = page?.url() ?? "page_closed";
    this.logger.error(
      { username, state, url, error: errorCode },
      "Account processing failed",
    );
    if (!page) return;

    try {
      await mkdir(this.config.screenshotsDir, { recursive: true });
      const filename = `${safeName(username)}_${state}_${timestampForFile()}.png`;
      await page.screenshot({
        path: join(this.config.screenshotsDir, filename),
        fullPage: true,
      });
    } catch (error) {
      this.logger.warn(
        {
          username,
          error: error instanceof Error ? error.message : String(error),
        },
        "Could not save failure screenshot",
      );
    }
  }
}
