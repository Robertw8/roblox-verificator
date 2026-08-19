import assert from "node:assert/strict";
import test from "node:test";
import { InvalidCredentialsError, WorkerError } from "../src/utils/errors.js";
import { retryDelayMs, shouldRetry } from "../src/utils/retry.js";

test("retries transient errors only within the configured budget", () => {
  const transient = new WorkerError("temporary", "temporary", true);
  assert.equal(shouldRetry(transient, 1, 2), true);
  assert.equal(shouldRetry(transient, 2, 2), true);
  assert.equal(shouldRetry(transient, 3, 2), false);
  assert.equal(shouldRetry(new InvalidCredentialsError(), 1, 2), false);
});

test("uses capped exponential backoff", () => {
  assert.equal(retryDelayMs(1, 2_000, 15_000), 2_000);
  assert.equal(retryDelayMs(2, 2_000, 15_000), 4_000);
  assert.equal(retryDelayMs(5, 2_000, 15_000), 15_000);
});
