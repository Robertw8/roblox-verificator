import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ResultStore } from "../src/storage/resultStore.js";

test("persists and upserts one result row per username", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "roblox-results-"));
  context.after(async () => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "results.csv");
  const store = new ResultStore(path);
  await store.load();

  await store.save({
    username: "Account_01",
    status: "timeout",
    attempts: 1,
    error: "result_timeout",
    processedAt: "2026-08-19T18:31:00.000Z",
  });
  await store.save({
    username: "Account_01",
    status: "verified",
    ageGroup: "18-20",
    attempts: 2,
    processedAt: "2026-08-19T18:32:00.000Z",
  });

  const reloaded = new ResultStore(path);
  const results = await reloaded.load();
  assert.equal(results.size, 1);
  assert.equal(results.get("Account_01")?.status, "verified");
  assert.equal(results.get("Account_01")?.ageGroup, "18-20");
  const csv = await readFile(path, "utf8");
  assert.equal(csv.trim().split("\n").length, 2);
});
