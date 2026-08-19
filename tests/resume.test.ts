import assert from "node:assert/strict";
import test from "node:test";
import type { Account, StoredResult } from "../src/types.js";
import { selectAccountsForRun } from "../src/worker/WorkerQueue.js";

const accounts: Account[] = [
  { username: "one", password: "a" },
  { username: "two", password: "b" },
  { username: "three", password: "c" },
];

function result(
  username: string,
  status: StoredResult["status"],
): StoredResult {
  return {
    username,
    status,
    attempts: 1,
    processedAt: "2026-08-19T18:31:00.000Z",
  };
}

test("resume selection skips successful and terminal failed results by default", () => {
  const results = new Map([
    ["one", result("one", "verified")],
    ["two", result("two", "failed")],
  ]);
  const selected = selectAccountsForRun(accounts, results, {
    resume: true,
    retryFailed: false,
  });
  assert.deepEqual(
    selected.map((account) => account.username),
    ["three"],
  );
});

test("retry-failed includes failures but never reprocesses successful accounts", () => {
  const results = new Map([
    ["one", result("one", "already_verified")],
    ["two", result("two", "timeout")],
  ]);
  const selected = selectAccountsForRun(accounts, results, {
    resume: true,
    retryFailed: true,
    limit: 1,
  });
  assert.deepEqual(
    selected.map((account) => account.username),
    ["two"],
  );
});
