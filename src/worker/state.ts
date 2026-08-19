import type { AccountState } from "../types.js";

const ACTIVE_STATES: AccountState[] = [
  "LOGIN",
  "OPEN_SETTINGS",
  "OPEN_AGE_VERIFICATION",
  "START_VERIFICATION",
  "WAITING_FOR_HUMAN",
  "WAITING_FOR_RESULT",
];

export const ALLOWED_TRANSITIONS: Readonly<
  Record<AccountState, readonly AccountState[]>
> = {
  PENDING: ["LOGIN", "FAILED", "RETRY", "DONE"],
  LOGIN: ["OPEN_SETTINGS", "FAILED", "RETRY", "LOGOUT"],
  OPEN_SETTINGS: ["OPEN_AGE_VERIFICATION", "FAILED", "RETRY", "LOGOUT"],
  OPEN_AGE_VERIFICATION: ["START_VERIFICATION", "FAILED", "RETRY", "LOGOUT"],
  START_VERIFICATION: ["WAITING_FOR_HUMAN", "FAILED", "RETRY", "LOGOUT"],
  WAITING_FOR_HUMAN: ["WAITING_FOR_RESULT", "FAILED", "RETRY", "LOGOUT"],
  WAITING_FOR_RESULT: ["VERIFIED", "FAILED", "RETRY", "LOGOUT"],
  VERIFIED: ["LOGOUT"],
  FAILED: ["LOGOUT", "RETRY", "DONE"],
  RETRY: ["LOGIN", "DONE"],
  LOGOUT: ["DONE", "FAILED", "RETRY"],
  DONE: ["RETRY"],
};

for (const state of ACTIVE_STATES) {
  if (!ALLOWED_TRANSITIONS[state].includes("RETRY")) {
    throw new Error(`State ${state} must support recovery to RETRY`);
  }
}

export function canTransition(from: AccountState, to: AccountState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: AccountState, to: AccountState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid account state transition: ${from} -> ${to}`);
  }
}
