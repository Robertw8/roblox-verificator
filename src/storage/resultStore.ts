import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { z } from "zod";
import { VERIFICATION_STATUSES, type StoredResult } from "../types.js";
import { atomicWriteFile } from "./atomicWrite.js";

const storedResultSchema = z.object({
  username: z.string().min(1),
  status: z.enum(VERIFICATION_STATUSES),
  ageGroup: z.string().optional(),
  attempts: z.coerce.number().int().positive(),
  error: z.string().optional(),
  processedAt: z.string().datetime(),
});

const COLUMNS = [
  "username",
  "status",
  "ageGroup",
  "attempts",
  "error",
  "processedAt",
] as const;

export class ResultStore {
  private readonly results = new Map<string, StoredResult>();

  public constructor(private readonly path: string) {}

  public async load(): Promise<Map<string, StoredResult>> {
    this.results.clear();
    try {
      const raw = await readFile(this.path, "utf8");
      const records = parse(raw, {
        bom: true,
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as Record<string, string>[];
      for (const record of records) {
        const parsed = storedResultSchema.parse({
          ...record,
          ageGroup: record.ageGroup || undefined,
          error: record.error || undefined,
        });
        const result: StoredResult = {
          username: parsed.username,
          status: parsed.status,
          attempts: parsed.attempts,
          processedAt: parsed.processedAt,
        };
        if (parsed.ageGroup !== undefined) result.ageGroup = parsed.ageGroup;
        if (parsed.error !== undefined) result.error = parsed.error;
        this.results.set(parsed.username, result);
      }
    } catch (error) {
      if (!(
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      )) {
        throw new Error(`Cannot load results file: ${this.path}`, {
          cause: error,
        });
      }
    }
    return this.snapshot();
  }

  public snapshot(): Map<string, StoredResult> {
    return new Map(
      [...this.results].map(([username, result]) => [
        username,
        structuredClone(result),
      ]),
    );
  }

  public get(username: string): StoredResult | undefined {
    const result = this.results.get(username);
    return result ? structuredClone(result) : undefined;
  }

  public async save(result: StoredResult): Promise<void> {
    this.results.set(result.username, structuredClone(result));
    const rows = [...this.results.values()].map((entry) => ({
      username: entry.username,
      status: entry.status,
      ageGroup: entry.ageGroup ?? "",
      attempts: entry.attempts,
      error: entry.error ?? "",
      processedAt: entry.processedAt,
    }));
    await atomicWriteFile(
      this.path,
      stringify(rows, {
        header: true,
        columns: [...COLUMNS],
        record_delimiter: "unix",
      }),
    );
  }
}
