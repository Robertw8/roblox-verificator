import { readFile } from "node:fs/promises";
import { z } from "zod";
import {
  ACCOUNT_STATES,
  type AccountProgress,
  type AccountState,
  type ProgressData,
} from "../types.js";
import { assertTransition } from "../worker/state.js";
import { atomicWriteFile } from "./atomicWrite.js";

const accountProgressSchema = z.object({
  state: z.enum(ACCOUNT_STATES),
  attempts: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
  lastError: z.string().optional(),
});

const progressSchema = z.object({
  version: z.literal(1),
  updatedAt: z.string().datetime(),
  accounts: z.record(z.string(), accountProgressSchema),
});

function emptyProgress(): ProgressData {
  const now = new Date().toISOString();
  return { version: 1, updatedAt: now, accounts: {} };
}

export class ProgressStore {
  private data: ProgressData = emptyProgress();

  public constructor(private readonly path: string) {}

  public async load(): Promise<ProgressData> {
    try {
      const raw = await readFile(this.path, "utf8");
      const parsed = progressSchema.parse(JSON.parse(raw));
      const accounts: Record<string, AccountProgress> = {};
      for (const [username, value] of Object.entries(parsed.accounts)) {
        const account: AccountProgress = {
          state: value.state,
          attempts: value.attempts,
          updatedAt: value.updatedAt,
        };
        if (value.lastError !== undefined) account.lastError = value.lastError;
        accounts[username] = account;
      }
      this.data = { version: 1, updatedAt: parsed.updatedAt, accounts };
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        this.data = emptyProgress();
      } else {
        throw new Error(`Cannot load progress file: ${this.path}`, {
          cause: error,
        });
      }
    }
    return this.snapshot();
  }

  public snapshot(): ProgressData {
    return structuredClone(this.data);
  }

  public get(username: string): AccountProgress | undefined {
    const value = this.data.accounts[username];
    return value ? structuredClone(value) : undefined;
  }

  public async ensure(username: string): Promise<AccountProgress> {
    const existing = this.data.accounts[username];
    if (existing) return structuredClone(existing);

    const created: AccountProgress = {
      state: "PENDING",
      attempts: 0,
      updatedAt: new Date().toISOString(),
    };
    this.data.accounts[username] = created;
    await this.persist();
    return structuredClone(created);
  }

  public async transition(
    username: string,
    nextState: AccountState,
    options: {
      attempts?: number;
      lastError?: string;
      clearError?: boolean;
    } = {},
  ): Promise<AccountProgress> {
    const current =
      this.data.accounts[username] ?? (await this.ensure(username));
    assertTransition(current.state, nextState);
    const updated: AccountProgress = {
      state: nextState,
      attempts: options.attempts ?? current.attempts,
      updatedAt: new Date().toISOString(),
    };
    const lastError = options.clearError
      ? undefined
      : (options.lastError ?? current.lastError);
    if (lastError !== undefined) updated.lastError = lastError;
    this.data.accounts[username] = updated;
    await this.persist();
    return structuredClone(updated);
  }

  public async persist(): Promise<void> {
    this.data.updatedAt = new Date().toISOString();
    await atomicWriteFile(this.path, `${JSON.stringify(this.data, null, 2)}\n`);
  }
}
