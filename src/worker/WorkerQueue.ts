import type { Logger } from "pino";
import { chromium, type Browser } from "playwright";
import type { Config } from "../config.js";
import type { ProgressStore } from "../storage/progressStore.js";
import type { ResultStore } from "../storage/resultStore.js";
import type {
  Account,
  CliOptions,
  StoredResult,
  VerificationStatus,
} from "../types.js";
import {
  ShutdownError,
  normalizeError,
  type WorkerError,
} from "../utils/errors.js";
import {
  retryDelayMs,
  shouldRetry,
  sleepWithShutdown,
} from "../utils/retry.js";
import { AccountWorker } from "./AccountWorker.js";

const SUCCESS_STATUSES = new Set<VerificationStatus>([
  "verified",
  "already_verified",
]);

function errorCodeForResult(status: VerificationStatus): string | undefined {
  if (status === "failed") return "verification_failed";
  if (status === "timeout") return "verification_timeout";
  if (status === "not_available") return "verification_unavailable";
  if (status === "unknown") return "unknown_result";
  return undefined;
}

export function selectAccountsForRun(
  accounts: readonly Account[],
  existingResults: ReadonlyMap<string, StoredResult>,
  options: CliOptions,
): Account[] {
  const requestedUsername = options.account?.toLowerCase();
  const selected = accounts.filter((account) => {
    if (
      requestedUsername &&
      account.username.toLowerCase() !== requestedUsername
    )
      return false;
    const existing = existingResults.get(account.username);
    if (!existing) return true;
    if (SUCCESS_STATUSES.has(existing.status)) return false;
    return options.retryFailed;
  });
  return options.limit === undefined
    ? selected
    : selected.slice(0, options.limit);
}

function resultStatusForError(error: WorkerError): VerificationStatus {
  if (error.code === "verification_unavailable") return "not_available";
  if (error.code.includes("timeout")) return "timeout";
  if (
    [
      "invalid_credentials",
      "security_challenge",
      "account_restricted",
    ].includes(error.code)
  ) {
    return "failed";
  }
  return "unknown";
}

export class WorkerQueue {
  private shutdownRequested = false;
  private browser: Browser | undefined;

  public constructor(
    private readonly config: Config,
    private readonly progressStore: ProgressStore,
    private readonly resultStore: ResultStore,
    private readonly logger: Logger,
  ) {}

  public requestShutdown(): void {
    if (this.shutdownRequested) return;
    this.shutdownRequested = true;
    this.logger.warn(
      "Graceful shutdown requested; current progress will be preserved",
    );
  }

  public async run(
    accounts: readonly Account[],
    options: CliOptions,
  ): Promise<void> {
    const selected = selectAccountsForRun(
      accounts,
      this.resultStore.snapshot(),
      options,
    );
    if (
      options.account &&
      !accounts.some(
        (item) =>
          item.username.toLowerCase() === options.account?.toLowerCase(),
      )
    ) {
      throw new Error(
        `Account '${options.account}' was not found in the validated input`,
      );
    }
    if (selected.length === 0) {
      this.logger.info("No accounts need processing");
      return;
    }

    this.logger.info(
      {
        selected: selected.length,
        total: accounts.length,
        resume: options.resume,
      },
      "Queue starting",
    );
    this.browser = await chromium.launch({ headless: this.config.headless });
    const worker = new AccountWorker(
      this.browser,
      this.config,
      this.progressStore,
      this.logger,
      () => this.shutdownRequested,
    );

    let completed = 0;
    try {
      for (const account of selected) {
        if (this.shutdownRequested) break;
        let progress = await this.progressStore.ensure(account.username);
        const wasInterruptedMidAttempt = ![
          "PENDING",
          "RETRY",
          "DONE",
          "FAILED",
          "LOGOUT",
        ].includes(progress.state);
        let attempt =
          options.retryFailed && this.resultStore.get(account.username)
            ? 0
            : Math.max(
                0,
                progress.attempts - (wasInterruptedMidAttempt ? 1 : 0),
              );

        if (progress.state !== "PENDING" && progress.state !== "RETRY") {
          progress = await this.progressStore.transition(
            account.username,
            "RETRY",
            {
              attempts: attempt,
              clearError: options.retryFailed,
            },
          );
        }

        let accountFinished = false;
        while (!accountFinished && !this.shutdownRequested) {
          attempt += 1;
          try {
            const result = await worker.process(account, attempt);
            const values: {
              ageGroup?: string;
              message?: string;
              error?: string;
            } = {};
            if (result.ageGroup !== undefined)
              values.ageGroup = result.ageGroup;
            if (result.message !== undefined) values.message = result.message;
            const resultError = errorCodeForResult(result.status);
            if (resultError !== undefined) values.error = resultError;
            const stored = this.toStoredResult(
              account.username,
              attempt,
              result.status,
              values,
            );
            await this.resultStore.save(stored);
            accountFinished = true;
          } catch (caught) {
            const error = normalizeError(caught);
            if (error instanceof ShutdownError || this.shutdownRequested) break;

            if (shouldRetry(error, attempt, this.config.maxRetries)) {
              const current = this.progressStore.get(account.username);
              if (current?.state !== "RETRY") {
                await this.progressStore.transition(account.username, "RETRY", {
                  attempts: attempt,
                  lastError: error.code,
                });
              }
              const delay = retryDelayMs(
                attempt,
                this.config.retryBaseDelayMs,
                this.config.retryMaxDelayMs,
              );
              this.logger.warn(
                {
                  username: account.username,
                  attempt,
                  maxRetries: this.config.maxRetries,
                  delay,
                  error: error.code,
                },
                "Transient failure; retrying account",
              );
              try {
                await sleepWithShutdown(delay, () => this.shutdownRequested);
              } catch (sleepError) {
                if (sleepError instanceof ShutdownError) break;
                throw sleepError;
              }
              continue;
            }

            const status = resultStatusForError(error);
            await this.resultStore.save(
              this.toStoredResult(account.username, attempt, status, {
                message: error.message,
                error: error.code,
              }),
            );
            const current = this.progressStore.get(account.username);
            if (current?.state !== "DONE") {
              await this.progressStore.transition(account.username, "DONE", {
                attempts: attempt,
                lastError: error.code,
              });
            }
            accountFinished = true;
          }
        }

        if (accountFinished) {
          completed += 1;
          this.logger.info(
            { completed, total: selected.length, username: account.username },
            `Queue progress: ${completed}/${selected.length}`,
          );
        }
      }
    } finally {
      await this.progressStore.persist();
      await this.browser.close().catch(() => undefined);
      this.browser = undefined;
      this.logger.info({ completed, total: selected.length }, "Queue stopped");
    }
  }

  private toStoredResult(
    username: string,
    attempts: number,
    status: VerificationStatus,
    values: { ageGroup?: string; message?: string; error?: string },
  ): StoredResult {
    const result: StoredResult = {
      username,
      status,
      attempts,
      processedAt: new Date().toISOString(),
    };
    if (values.ageGroup !== undefined) result.ageGroup = values.ageGroup;
    if (values.message !== undefined) result.message = values.message;
    if (values.error !== undefined) result.error = values.error;
    return result;
  }
}
