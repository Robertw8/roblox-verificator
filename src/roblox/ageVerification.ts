import type { BrowserContext, Frame, Page } from "playwright";
import type { VerificationResult } from "../types.js";
import {
  ShutdownError,
  UnexpectedPageError,
  VerificationTimeoutError,
  VerificationUnavailableError,
} from "../utils/errors.js";
import { sleepWithShutdown } from "../utils/retry.js";
import {
  firstVisible,
  SELECTOR_TEXT,
  selfieMethodLocators,
  verifyAgeLocators,
  type LocatorScope,
} from "./selectors.js";

export type VerificationSession = {
  context: BrowserContext;
  originPage: Page;
  verificationPage: Page;
  initialRelevantSurfaceCount: number;
  immediateResult?: VerificationResult;
};

const AGE_GROUP_PATTERN =
  /(?:\bunder\s+\d{1,2}|\b\d{1,2}\s*(?:-|–|—|to)\s*\d{1,2}|\b\d{1,2}\s*\+)(?=$|\s|[.,;:!?])/i;

const VERIFICATION_URL_PATTERN =
  /verify|verification|persona|veriff|liveness|selfie|camera|age-estimation/i;
const COMPLETION_URL_PATTERN =
  /callback|complete|completed|result|return|success/i;

export function extractAgeGroup(text: string): string | undefined {
  return text.match(AGE_GROUP_PATTERN)?.[0].replace(/\s+/g, " ").trim();
}

export function inspectVerificationText(
  text: string,
): VerificationResult | undefined {
  const ageGroup = extractAgeGroup(text);
  if (SELECTOR_TEXT.age.alreadyVerified.test(text)) {
    return ageGroup
      ? {
          status: "already_verified",
          ageGroup,
          message: "Roblox reports age already verified",
        }
      : {
          status: "already_verified",
          message: "Roblox reports age already verified",
        };
  }
  if (SELECTOR_TEXT.age.manualReview.test(text)) {
    return {
      status: "manual_review",
      message: "Verification is pending manual review",
    };
  }
  if (SELECTOR_TEXT.age.failure.test(text)) {
    return {
      status: "failed",
      message: "Roblox or the verification provider reported failure",
    };
  }
  if (SELECTOR_TEXT.age.unavailable.test(text)) {
    return {
      status: "not_available",
      message: "Selfie age verification is unavailable",
    };
  }
  if (
    SELECTOR_TEXT.age.success.test(text) ||
    (ageGroup && /verified|age group/i.test(text))
  ) {
    return ageGroup
      ? { status: "verified", ageGroup, message: "Age verification completed" }
      : { status: "verified", message: "Age verification completed" };
  }
  return undefined;
}

async function scopeText(scope: LocatorScope): Promise<string> {
  return scope
    .locator("body")
    .innerText({ timeout: 1_000 })
    .catch(() => "");
}

function activePages(context: BrowserContext): Page[] {
  return context.pages().filter((page) => !page.isClosed());
}

async function inspectContext(
  context: BrowserContext,
): Promise<VerificationResult | undefined> {
  for (const page of activePages(context).reverse()) {
    for (const frame of page.frames()) {
      const result = inspectVerificationText(await scopeText(frame));
      if (result) return result;
    }
  }
  return undefined;
}

async function relevantSurfaceCount(context: BrowserContext): Promise<number> {
  let count = 0;
  for (const page of activePages(context)) {
    for (const frame of page.frames()) {
      const text = await scopeText(frame);
      if (
        VERIFICATION_URL_PATTERN.test(frame.url()) ||
        SELECTOR_TEXT.age.cameraSurface.test(text)
      ) {
        count += 1;
      }
    }
  }
  return count;
}

async function findInContext<T>(
  context: BrowserContext,
  finder: (scope: Frame) => Promise<T | undefined>,
): Promise<T | undefined> {
  for (const page of activePages(context).reverse()) {
    for (const frame of page.frames()) {
      const result = await finder(frame);
      if (result !== undefined) return result;
    }
  }
  return undefined;
}

async function newestPageAfter(
  context: BrowserContext,
  before: Set<Page>,
): Promise<Page | undefined> {
  await sleepWithShutdown(1_000, () => false);
  return activePages(context)
    .reverse()
    .find((page) => !before.has(page));
}

export async function startSelfieVerification(
  originPage: Page,
  timeoutMs: number,
  isShutdownRequested: () => boolean,
): Promise<VerificationSession> {
  const context = originPage.context();
  const initialResult = await inspectContext(context);
  if (initialResult?.status === "already_verified") {
    return {
      context,
      originPage,
      verificationPage: originPage,
      initialRelevantSurfaceCount: 0,
      immediateResult: initialResult,
    };
  }

  const verifyControl = await findInContext(context, async (frame) =>
    firstVisible(verifyAgeLocators(frame), 250),
  );
  if (!verifyControl)
    throw new UnexpectedPageError("Verify age control disappeared");

  const pagesBeforeVerify = new Set(context.pages());
  await verifyControl.click();
  let verificationPage =
    (await newestPageAfter(context, pagesBeforeVerify)) ?? originPage;

  const deadline = Date.now() + Math.min(timeoutMs, 15_000);
  let idOnlyMethodSeen = false;
  while (Date.now() < deadline) {
    if (isShutdownRequested()) throw new ShutdownError();

    const immediateResult = await inspectContext(context);
    if (immediateResult) {
      return {
        context,
        originPage,
        verificationPage,
        initialRelevantSurfaceCount: await relevantSurfaceCount(context),
        immediateResult,
      };
    }

    const selfieControl = await findInContext(context, async (frame) =>
      firstVisible(selfieMethodLocators(frame), 200),
    );
    if (selfieControl) {
      const label = await selfieControl.innerText().catch(() => "");
      if (!SELECTOR_TEXT.age.idMethod.test(label)) {
        const pagesBeforeSelfie = new Set(context.pages());
        await selfieControl.click();
        verificationPage =
          (await newestPageAfter(context, pagesBeforeSelfie)) ??
          activePages(context)
            .reverse()
            .find((page) => VERIFICATION_URL_PATTERN.test(page.url())) ??
          verificationPage;
        await sleepWithShutdown(1_000, isShutdownRequested);
        return {
          context,
          originPage,
          verificationPage,
          initialRelevantSurfaceCount: await relevantSurfaceCount(context),
        };
      }
    }

    const combinedText = (
      await Promise.all(
        activePages(context).flatMap((page) =>
          page.frames().map((frame) => scopeText(frame)),
        ),
      )
    ).join("\n");
    if (SELECTOR_TEXT.age.cameraSurface.test(combinedText)) {
      return {
        context,
        originPage,
        verificationPage,
        initialRelevantSurfaceCount: await relevantSurfaceCount(context),
      };
    }
    if (SELECTOR_TEXT.age.idMethod.test(combinedText)) idOnlyMethodSeen = true;
    if (SELECTOR_TEXT.age.unavailable.test(combinedText))
      throw new VerificationUnavailableError();

    await sleepWithShutdown(500, isShutdownRequested);
  }

  if (idOnlyMethodSeen) {
    throw new VerificationUnavailableError(
      "Only ID/document verification was offered; it was not selected",
    );
  }
  throw new UnexpectedPageError(
    "Selfie/camera verification control was not found",
  );
}

async function completionDetected(
  session: VerificationSession,
): Promise<boolean> {
  if (
    session.verificationPage !== session.originPage &&
    session.verificationPage.isClosed()
  )
    return true;

  for (const page of activePages(session.context)) {
    if (
      COMPLETION_URL_PATTERN.test(page.url()) &&
      VERIFICATION_URL_PATTERN.test(page.url())
    )
      return true;
    for (const frame of page.frames()) {
      const text = await scopeText(frame);
      if (SELECTOR_TEXT.age.completion.test(text)) return true;
    }
  }

  if (session.initialRelevantSurfaceCount > 0) {
    return (await relevantSurfaceCount(session.context)) === 0;
  }
  return false;
}

export async function awaitVerificationOutcome(
  session: VerificationSession,
  humanTimeoutMs: number,
  resultTimeoutMs: number,
  onWaitingForResult: () => Promise<void>,
  isShutdownRequested: () => boolean,
): Promise<VerificationResult> {
  let resultStateStarted = false;
  const startResultState = async (): Promise<void> => {
    if (resultStateStarted) return;
    resultStateStarted = true;
    await onWaitingForResult();
  };

  if (session.immediateResult) {
    await startResultState();
    return session.immediateResult;
  }

  const humanDeadline = Date.now() + humanTimeoutMs;
  while (Date.now() < humanDeadline) {
    if (isShutdownRequested()) throw new ShutdownError();
    const result = await inspectContext(session.context);
    if (result) {
      await startResultState();
      return result;
    }
    if (await completionDetected(session)) break;
    await sleepWithShutdown(1_000, isShutdownRequested);
  }

  if (Date.now() >= humanDeadline) {
    throw new VerificationTimeoutError(
      "human_verification_timeout",
      "The operator did not complete selfie verification before timeout",
    );
  }

  await startResultState();
  const resultDeadline = Date.now() + resultTimeoutMs;
  while (Date.now() < resultDeadline) {
    if (isShutdownRequested()) throw new ShutdownError();
    const result = await inspectContext(session.context);
    if (result) return result;
    await sleepWithShutdown(1_000, isShutdownRequested);
  }

  throw new VerificationTimeoutError(
    "result_timeout",
    "Verification completed, but Roblox did not display a result before timeout",
  );
}
