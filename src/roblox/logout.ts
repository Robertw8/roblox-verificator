import type { Logger } from "pino";
import type { Page } from "playwright";
import { ROBLOX_URLS } from "./selectors.js";

export async function logout(
  page: Page,
  timeoutMs: number,
  logger: Logger,
): Promise<void> {
  if (page.isClosed()) return;

  try {
    const menu = page
      .getByRole("button", { name: /account|profile|settings|more/i })
      .filter({ visible: true })
      .first();
    if (await menu.isVisible({ timeout: 500 }).catch(() => false))
      await menu.click();

    const logoutControl = page
      .getByRole("button", { name: /^log\s*out$/i })
      .first();
    if (await logoutControl.isVisible({ timeout: 750 }).catch(() => false)) {
      await logoutControl.click();
      await page
        .waitForLoadState("domcontentloaded", { timeout: 5_000 })
        .catch(() => undefined);
      return;
    }

    await page.goto(ROBLOX_URLS.logout, {
      waitUntil: "domcontentloaded",
      timeout: Math.min(timeoutMs, 10_000),
    });
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      "Logout failed",
    );
  }
}
