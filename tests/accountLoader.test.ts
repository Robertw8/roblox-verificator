import assert from "node:assert/strict";
import test from "node:test";
import { parseAccountsCsv } from "../src/storage/accountLoader.js";

test("parses a valid headered account CSV", () => {
  const result = parseAccountsCsv(
    "username,password\nAccount_01,secret one\nAccount_02,secret two\n",
  );
  assert.deepEqual(result.accounts, [
    { username: "Account_01", password: "secret one" },
    { username: "Account_02", password: "secret two" },
  ]);
  assert.equal(result.issues.length, 0);
  assert.equal(result.usedLegacyHeaderlessFormat, false);
});

test("skips invalid and duplicate rows without including secrets in issues", () => {
  const secret = "never-log-this";
  const result = parseAccountsCsv(
    `username,password\nok_user,valid\nbad-name,${secret}\nOK_USER,another\nmissing-column\n`,
  );
  assert.deepEqual(result.accounts, [
    { username: "ok_user", password: "valid" },
  ]);
  assert.equal(result.issues.length, 3);
  assert.equal(JSON.stringify(result.issues).includes(secret), false);
});

test("supports legacy headerless input with a warning", () => {
  const result = parseAccountsCsv("Account_01,secret\n");
  assert.equal(result.accounts.length, 1);
  assert.equal(result.usedLegacyHeaderlessFormat, true);
  assert.match(result.issues[0]?.message ?? "", /missing.*header/i);
});

test("preserves password whitespace exactly", () => {
  const result = parseAccountsCsv(
    'username,password\n Account_01 ," secret "\n',
  );
  assert.deepEqual(result.accounts, [
    { username: "Account_01", password: " secret " },
  ]);
});
