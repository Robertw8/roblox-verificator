import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ProgressStore } from "../src/storage/progressStore.js";

test("persists explicit account state transitions", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "roblox-progress-"));
  context.after(async () => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "progress.json");
  const store = new ProgressStore(path);
  await store.load();
  await store.ensure("Account_01");
  await store.transition("Account_01", "LOGIN", { attempts: 1 });
  await store.transition("Account_01", "OPEN_SETTINGS");

  const reloaded = new ProgressStore(path);
  await reloaded.load();
  assert.equal(reloaded.get("Account_01")?.state, "OPEN_SETTINGS");
  assert.equal(reloaded.get("Account_01")?.attempts, 1);
});

test("rejects invalid state transitions", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "roblox-progress-invalid-"));
  context.after(async () => rm(directory, { recursive: true, force: true }));
  const store = new ProgressStore(join(directory, "progress.json"));
  await store.load();
  await store.ensure("Account_01");
  await assert.rejects(
    store.transition("Account_01", "VERIFIED"),
    /PENDING -> VERIFIED/,
  );
});
