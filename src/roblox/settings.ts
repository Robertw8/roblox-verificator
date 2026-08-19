import type { Page } from "playwright";
import { UnexpectedPageError } from "../utils/errors.js";
import { sleepWithShutdown } from "../utils/retry.js";
import {
  accountInfoLocators,
  ageSectionLocators,
  firstVisible,
  ROBLOX_URLS,
  SELECTOR_TEXT,
  verifyAgeLocators,
} from "./selectors.js";

export async function openAccountSettings(
  page: Page,
  timeoutMs: number,
): Promise<void> {
  await page.goto(ROBLOX_URLS.accountSettings, {
    waitUntil: "domcontentloaded",
    timeout: timeoutMs,
  });
  if (/\/login(?:[/?#]|$)/i.test(page.url())) {
    throw new UnexpectedPageError("Opening settings redirected back to login");
  }
}

export async function openAgeVerificationSection(
  page: Page,
  timeoutMs: number,
  isShutdownRequested: () => boolean,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let accountInfoClicked = false;
  let ageSectionClicked = false;

  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      const text = await frame
        .locator("body")
        .innerText({ timeout: 500 })
        .catch(() => "");
      if (SELECTOR_TEXT.age.alreadyVerified.test(text)) return;

      const verifyControl = await firstVisible(verifyAgeLocators(frame), 100);
      if (verifyControl) {
        await verifyControl.scrollIntoViewIfNeeded().catch(() => undefined);
        return;
      }

      const ageSection = ageSectionClicked
        ? undefined
        : await firstVisible(ageSectionLocators(frame), 100);
      if (ageSection) {
        ageSectionClicked = true;
        await ageSection.click().catch(() => undefined);
        await sleepWithShutdown(500, isShutdownRequested);
        continue;
      }

      if (!accountInfoClicked) {
        const accountInfo = await firstVisible(accountInfoLocators(frame), 100);
        if (accountInfo) {
          accountInfoClicked = true;
          await accountInfo.click().catch(() => undefined);
        }
      }
    }
    await sleepWithShutdown(500, isShutdownRequested);
  }

  throw new UnexpectedPageError(
    "Age verification controls were not found in account settings",
  );
}
