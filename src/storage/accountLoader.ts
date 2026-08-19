import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import type { Account } from "../types.js";

const accountSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_]{3,20}$/, "must be a valid Roblox username"),
  password: z
    .string()
    .min(1, "password is required")
    .max(256, "password is too long")
    .refine((value) => value.trim().length > 0, "password is required"),
});

export type AccountLoadIssue = {
  row: number;
  message: string;
};

export type AccountLoadResult = {
  accounts: Account[];
  issues: AccountLoadIssue[];
  usedLegacyHeaderlessFormat: boolean;
};

export function parseAccountsCsv(contents: string): AccountLoadResult {
  const issues: AccountLoadIssue[] = [];
  let records: string[][];
  try {
    records = parse(contents, {
      bom: true,
      skip_empty_lines: true,
      trim: false,
      relax_column_count: true,
      skip_records_with_error: true,
      on_skip: (error: unknown) => {
        const row =
          typeof error === "object" &&
          error !== null &&
          "lines" in error &&
          typeof error.lines === "number"
            ? error.lines
            : 0;
        issues.push({ row, message: "Malformed CSV record skipped" });
      },
    }) as string[][];
  } catch {
    return {
      accounts: [],
      issues: [{ row: 0, message: "CSV syntax is invalid" }],
      usedLegacyHeaderlessFormat: false,
    };
  }

  if (records.length === 0) {
    return {
      accounts: [],
      issues: [{ row: 1, message: "CSV file is empty" }],
      usedLegacyHeaderlessFormat: false,
    };
  }

  const first = records[0] ?? [];
  const normalizedHeader = first.map((cell) => cell.trim().toLowerCase());
  const hasHeader =
    normalizedHeader[0] === "username" && normalizedHeader[1] === "password";
  const resemblesHeader =
    normalizedHeader.includes("username") ||
    normalizedHeader.includes("password");

  if (!hasHeader && resemblesHeader) {
    return {
      accounts: [],
      issues: [
        { row: 1, message: "CSV header must start with username,password" },
      ],
      usedLegacyHeaderlessFormat: false,
    };
  }

  const usedLegacyHeaderlessFormat = !hasHeader;
  const dataStart = hasHeader ? 1 : 0;
  if (usedLegacyHeaderlessFormat) {
    issues.push({
      row: 1,
      message:
        "Missing username,password header; interpreted file as legacy headerless input",
    });
  }

  const accounts: Account[] = [];
  const usernames = new Set<string>();
  for (let index = dataStart; index < records.length; index += 1) {
    const record = records[index] ?? [];
    const row = index + 1;
    if (record.length !== 2) {
      issues.push({ row, message: "Expected exactly two columns" });
      continue;
    }

    const parsed = accountSchema.safeParse({
      username: record[0],
      password: record[1],
    });
    if (!parsed.success) {
      issues.push({
        row,
        message: parsed.error.issues.map((issue) => issue.message).join("; "),
      });
      continue;
    }

    const key = parsed.data.username.toLowerCase();
    if (usernames.has(key)) {
      issues.push({ row, message: "Duplicate username" });
      continue;
    }
    usernames.add(key);
    accounts.push(parsed.data);
  }

  return { accounts, issues, usedLegacyHeaderlessFormat };
}

export async function loadAccounts(path: string): Promise<AccountLoadResult> {
  return parseAccountsCsv(await readFile(path, "utf8"));
}
