export const ACCOUNT_STATES = [
  "PENDING",
  "LOGIN",
  "OPEN_SETTINGS",
  "OPEN_AGE_VERIFICATION",
  "START_VERIFICATION",
  "WAITING_FOR_HUMAN",
  "WAITING_FOR_RESULT",
  "VERIFIED",
  "FAILED",
  "RETRY",
  "LOGOUT",
  "DONE",
] as const;

export type AccountState = (typeof ACCOUNT_STATES)[number];

export type Account = {
  username: string;
  password: string;
};

export const VERIFICATION_STATUSES = [
  "verified",
  "failed",
  "timeout",
  "not_available",
  "already_verified",
  "manual_review",
  "unknown",
] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export type VerificationResult = {
  status: VerificationStatus;
  ageGroup?: string;
  message?: string;
};

export type StoredResult = VerificationResult & {
  username: string;
  attempts: number;
  error?: string;
  processedAt: string;
};

export type AccountProgress = {
  state: AccountState;
  attempts: number;
  updatedAt: string;
  lastError?: string;
};

export type ProgressData = {
  version: 1;
  updatedAt: string;
  accounts: Record<string, AccountProgress>;
};

export type CliOptions = {
  resume: boolean;
  retryFailed: boolean;
  account?: string;
  limit?: number;
};
