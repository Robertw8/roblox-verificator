import assert from "node:assert/strict";
import test from "node:test";
import { assertTransition, canTransition } from "../src/worker/state.js";

test("allows the successful state-machine path", () => {
  const path = [
    "PENDING",
    "LOGIN",
    "OPEN_SETTINGS",
    "OPEN_AGE_VERIFICATION",
    "START_VERIFICATION",
    "WAITING_FOR_HUMAN",
    "WAITING_FOR_RESULT",
    "VERIFIED",
    "LOGOUT",
    "DONE",
  ] as const;
  for (let index = 0; index < path.length - 1; index += 1) {
    assert.equal(canTransition(path[index]!, path[index + 1]!), true);
  }
});

test("rejects skipped and repeated states", () => {
  assert.throws(() => assertTransition("PENDING", "VERIFIED"));
  assert.equal(canTransition("LOGIN", "LOGIN"), false);
});
