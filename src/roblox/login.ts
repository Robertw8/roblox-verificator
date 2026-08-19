import type { Logger } from "pino";
import type { Page } from "playwright";
import type { Account } from "../types.js";
import {
  AccountRestrictedError,
  InvalidCredentialsError,
  SecurityChallengeError,
  UnexpectedPageError,
} from "../utils/errors.js";
import { sleepWithShutdown } from "../utils/retry.js";
import {
  firstVisible,
  loginPasswordLocators,
  loginSubmitLocators,
  loginUsernameLocators,
  ROBLOX_URLS,
  SELECTOR_TEXT,
} from "./selectors.js";

export async function login(
  page: Page,
  account: Account,
  timeoutMs: number,
  logger: Logger,
  isShutdownRequested: () => boolean,
): Promise<void> {
  await page.goto(ROBLOX_URLS.login, {
    waitUntil: "domcontentloaded",
    timeout: timeoutMs,
  });

  const username = await firstVisible(loginUsernameLocators(page), 1_000);
  const password = await firstVisible(loginPasswordLocators(page), 1_000);
  const submit = await firstVisible(loginSubmitLocators(page), 1_000);
  if (!username || !password || !submit) {
    throw new UnexpectedPageError("Login form was not found");
  }

  await username.fill(account.username);
  await password.fill(account.password);
  await submit.click();

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const text = await page
      .locator("body")
      .innerText({ timeout: 2_000 })
      .catch(() => "");
    if (SELECTOR_TEXT.login.invalid.test(text))
      throw new InvalidCredentialsError();
    if (SELECTOR_TEXT.login.restricted.test(text))
      throw new AccountRestrictedError();
    if (SELECTOR_TEXT.login.challenge.test(text))
      throw new SecurityChallengeError();

    const url = page.url();
    const loginForm = await firstVisible(loginUsernameLocators(page), 100);
    if (!/\/login(?:[/?#]|$)/i.test(url) && !loginForm) {
      logger.info(
        { username: account.username, state: "LOGIN" },
        "LOGIN success",
      );
      return;
    }
    await sleepWithShutdown(500, isShutdownRequested);
  }

  throw new UnexpectedPageError(
    "Login did not reach an authenticated page before timeout",
  );
}
