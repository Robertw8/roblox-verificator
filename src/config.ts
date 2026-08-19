import process from "node:process";
import { resolve } from "node:path";
import { z } from "zod";

try {
  process.loadEnvFile?.();
} catch (error) {
  const code =
    error instanceof Error && "code" in error ? error.code : undefined;
  if (code !== "ENOENT") throw error;
}

const booleanFromEnv = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value, context) => {
    if (["1", "true", "yes", "on"].includes(value)) return true;
    if (["0", "false", "no", "off"].includes(value)) return false;
    context.addIssue({ code: "custom", message: "expected a boolean" });
    return z.NEVER;
  });

const positiveInteger = z.coerce.number().int().positive();

const envSchema = z.object({
  HEADLESS: booleanFromEnv.default(false),
  MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(2),
  LOGIN_TIMEOUT_MS: positiveInteger.default(30_000),
  NAVIGATION_TIMEOUT_MS: positiveInteger.default(30_000),
  HUMAN_VERIFICATION_TIMEOUT_MS: positiveInteger.default(180_000),
  RESULT_TIMEOUT_MS: positiveInteger.default(60_000),
  RETRY_BASE_DELAY_MS: positiveInteger.default(2_000),
  RETRY_MAX_DELAY_MS: positiveInteger.default(15_000),
  TRACE_ON_FAILURE: booleanFromEnv.default(false),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  LOG_PRETTY: booleanFromEnv.default(true),
  ACCOUNTS_FILE: z.string().min(1).default("data/accounts.csv"),
  RESULTS_FILE: z.string().min(1).default("data/results.csv"),
  PROGRESS_FILE: z.string().min(1).default("data/progress.json"),
  SCREENSHOTS_DIR: z.string().min(1).default("screenshots"),
  TRACES_DIR: z.string().min(1).default("traces"),
});

export type Config = {
  headless: boolean;
  maxRetries: number;
  loginTimeoutMs: number;
  navigationTimeoutMs: number;
  humanVerificationTimeoutMs: number;
  resultTimeoutMs: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  traceOnFailure: boolean;
  logLevel: z.infer<typeof envSchema>["LOG_LEVEL"];
  logPretty: boolean;
  accountsFile: string;
  resultsFile: string;
  progressFile: string;
  screenshotsDir: string;
  tracesDir: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.parse(env);
  return {
    headless: parsed.HEADLESS,
    maxRetries: parsed.MAX_RETRIES,
    loginTimeoutMs: parsed.LOGIN_TIMEOUT_MS,
    navigationTimeoutMs: parsed.NAVIGATION_TIMEOUT_MS,
    humanVerificationTimeoutMs: parsed.HUMAN_VERIFICATION_TIMEOUT_MS,
    resultTimeoutMs: parsed.RESULT_TIMEOUT_MS,
    retryBaseDelayMs: parsed.RETRY_BASE_DELAY_MS,
    retryMaxDelayMs: parsed.RETRY_MAX_DELAY_MS,
    traceOnFailure: parsed.TRACE_ON_FAILURE,
    logLevel: parsed.LOG_LEVEL,
    logPretty: parsed.LOG_PRETTY,
    accountsFile: resolve(parsed.ACCOUNTS_FILE),
    resultsFile: resolve(parsed.RESULTS_FILE),
    progressFile: resolve(parsed.PROGRESS_FILE),
    screenshotsDir: resolve(parsed.SCREENSHOTS_DIR),
    tracesDir: resolve(parsed.TRACES_DIR),
  };
}
