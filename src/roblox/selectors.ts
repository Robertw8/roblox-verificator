import type { Frame, Locator, Page } from "playwright";

export type LocatorScope = Page | Frame;

export const ROBLOX_URLS = {
  login: "https://www.roblox.com/login",
  accountSettings: "https://www.roblox.com/my/account#!/info",
  logout: "https://www.roblox.com/logout",
} as const;

export const SELECTOR_TEXT = {
  login: {
    username: /username(?:\s*\/\s*email(?:\s*\/\s*phone)?)?/i,
    password: /password/i,
    submit: /^log\s*in$/i,
    invalid:
      /incorrect username or password|username or password is incorrect|invalid credentials/i,
    challenge: /captcha|security check|verify that you are human|challenge/i,
    restricted:
      /account (?:has been )?(?:locked|restricted|moderated|deleted|disabled)/i,
  },
  settings: {
    accountInfo: /account info|personal information/i,
    ageSection: /age verification|verify (?:my )?age|age estimate/i,
  },
  age: {
    verify:
      /verify (?:my )?age|continue.*age verification|start.*age verification/i,
    selfieMethod:
      /selfie|camera|facial age (?:estimation|verification)|estimate my age/i,
    cameraSurface:
      /camera|selfie|liveness|position your face|face.*frame|allow.*camera/i,
    idMethod:
      /government.*id|identity document|passport|driver'?s license|verify with id/i,
    unavailable:
      /age verification (?:is )?not available|unable to verify your age|not eligible/i,
    alreadyVerified: /already (?:age )?verified|age (?:has been )?verified/i,
    success:
      /verification (?:was |is )?(?:successful|complete|completed)|age verified|you are verified/i,
    failure:
      /verification (?:was |has )?failed|could not verify|unable to verify|verification cancelled/i,
    manualReview:
      /manual review|under review|review in progress|pending review/i,
    completion:
      /you may (?:now )?close|return to roblox|verification complete|verification submitted/i,
  },
} as const;

export function loginUsernameLocators(scope: LocatorScope): Locator[] {
  return [
    scope.getByLabel(SELECTOR_TEXT.login.username),
    scope.getByRole("textbox", { name: SELECTOR_TEXT.login.username }),
    scope.locator("#login-username"),
    scope.locator('input[name="username"]'),
  ];
}

export function loginPasswordLocators(scope: LocatorScope): Locator[] {
  return [
    scope.getByLabel(SELECTOR_TEXT.login.password),
    scope.locator("#login-password"),
    scope.locator('input[name="password"]'),
    scope.locator('input[type="password"]'),
  ];
}

export function loginSubmitLocators(scope: LocatorScope): Locator[] {
  return [
    scope.getByRole("button", { name: SELECTOR_TEXT.login.submit }),
    scope.locator("#login-button"),
    scope.locator('button[type="submit"]'),
  ];
}

export function ageSectionLocators(scope: LocatorScope): Locator[] {
  return [
    scope.getByRole("tab", { name: SELECTOR_TEXT.settings.ageSection }),
    scope.getByRole("link", { name: SELECTOR_TEXT.settings.ageSection }),
    scope.getByRole("button", { name: SELECTOR_TEXT.settings.ageSection }),
    scope.getByText(SELECTOR_TEXT.settings.ageSection, { exact: false }),
    scope.locator('[data-testid*="age-verification" i]'),
  ];
}

export function accountInfoLocators(scope: LocatorScope): Locator[] {
  return [
    scope.getByRole("tab", { name: SELECTOR_TEXT.settings.accountInfo }),
    scope.getByRole("link", { name: SELECTOR_TEXT.settings.accountInfo }),
    scope.getByText(SELECTOR_TEXT.settings.accountInfo, { exact: false }),
  ];
}

export function verifyAgeLocators(scope: LocatorScope): Locator[] {
  return [
    scope.getByRole("button", { name: SELECTOR_TEXT.age.verify }),
    scope.getByRole("link", { name: SELECTOR_TEXT.age.verify }),
    scope.locator('[data-testid*="verify-age" i]'),
    scope.getByText(SELECTOR_TEXT.age.verify, { exact: false }),
  ];
}

export function selfieMethodLocators(scope: LocatorScope): Locator[] {
  return [
    scope.getByRole("button", { name: SELECTOR_TEXT.age.selfieMethod }),
    scope.getByRole("link", { name: SELECTOR_TEXT.age.selfieMethod }),
    scope.getByLabel(SELECTOR_TEXT.age.selfieMethod),
    scope.locator('[data-testid*="selfie" i], [data-testid*="camera" i]'),
  ];
}

export async function firstVisible(
  locators: readonly Locator[],
  timeoutMs = 500,
): Promise<Locator | undefined> {
  for (const candidate of locators) {
    const locator = candidate.first();
    try {
      if (await locator.isVisible({ timeout: timeoutMs })) return locator;
    } catch {
      // The frame may have detached while a popup or redirect was opening.
    }
  }
  return undefined;
}
