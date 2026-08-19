export class WorkerError extends Error {
  public constructor(
    message: string,
    public readonly code: string,
    public readonly retriable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class InvalidCredentialsError extends WorkerError {
  public constructor(message = "Roblox rejected the supplied credentials") {
    super(message, "invalid_credentials", false);
  }
}

export class SecurityChallengeError extends WorkerError {
  public constructor(
    message = "A login security challenge requires operator review",
  ) {
    super(message, "security_challenge", false);
  }
}

export class AccountRestrictedError extends WorkerError {
  public constructor(message = "The account is locked or restricted") {
    super(message, "account_restricted", false);
  }
}

export class VerificationUnavailableError extends WorkerError {
  public constructor(message = "Selfie age verification is not available") {
    super(message, "verification_unavailable", false);
  }
}

export class VerificationTimeoutError extends WorkerError {
  public constructor(
    code = "verification_timeout",
    message = "Verification timed out",
  ) {
    super(message, code, true);
  }
}

export class NavigationTimeoutError extends WorkerError {
  public constructor(
    message = "Browser navigation timed out",
    options?: ErrorOptions,
  ) {
    super(message, "navigation_timeout", true, options);
  }
}

export class UnexpectedPageError extends WorkerError {
  public constructor(message = "Roblox displayed an unexpected page") {
    super(message, "unexpected_page", true);
  }
}

export class ShutdownError extends WorkerError {
  public constructor() {
    super("Worker shutdown requested", "shutdown_requested", false);
  }
}

export function normalizeError(error: unknown): WorkerError {
  if (error instanceof WorkerError) return error;
  if (error instanceof Error && error.name === "TimeoutError") {
    return new NavigationTimeoutError(error.message, { cause: error });
  }
  return new WorkerError(
    error instanceof Error ? error.message : "Unknown worker error",
    "unexpected_error",
    true,
    error instanceof Error ? { cause: error } : undefined,
  );
}
