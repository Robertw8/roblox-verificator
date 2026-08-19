import assert from "node:assert/strict";
import test from "node:test";
import {
  extractAgeGroup,
  inspectVerificationText,
} from "../src/roblox/ageVerification.js";

test("extracts arbitrary displayed age-group ranges", () => {
  assert.equal(extractAgeGroup("Your age group is 18-20"), "18-20");
  assert.equal(extractAgeGroup("Verified: 21+"), "21+");
  assert.equal(extractAgeGroup("Result: 13 to 15"), "13 to 15");
});

test("classifies verification outcomes without hardcoding one age group", () => {
  assert.deepEqual(
    inspectVerificationText("Verification complete. Age group: 35-44"),
    {
      status: "verified",
      ageGroup: "35-44",
      message: "Age verification completed",
    },
  );
  assert.equal(
    inspectVerificationText("Your submission is under review")?.status,
    "manual_review",
  );
  assert.equal(
    inspectVerificationText("Verification failed")?.status,
    "failed",
  );
});
