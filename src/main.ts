import process from "node:process";
import { parseArgs } from "node:util";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { loadAccounts } from "./storage/accountLoader.js";
import { ProgressStore } from "./storage/progressStore.js";
import { ResultStore } from "./storage/resultStore.js";
import type { CliOptions } from "./types.js";
import { createLogger } from "./utils/logger.js";
import { WorkerQueue } from "./worker/WorkerQueue.js";

const limitSchema = z.coerce.number().int().positive();

function printHelp(): void {
  process.stdout.write(
    `Roblox age-verification worker\n\nUsage:\n  npm run start -- [options]\n\nOptions:\n  --resume              Resume unfinished accounts (default behavior is already resumable)\n  --retry-failed        Retry accounts with an existing non-success result\n  --account USERNAME    Process one account\n  --limit NUMBER        Process at most NUMBER selected accounts\n  --help                Show this help\n`,
  );
}

export function parseCliOptions(
  args: string[],
): CliOptions & { help: boolean } {
  const parsed = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      resume: { type: "boolean", default: false },
      "retry-failed": { type: "boolean", default: false },
      account: { type: "string" },
      limit: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  const options: CliOptions & { help: boolean } = {
    resume: parsed.values.resume ?? false,
    retryFailed: parsed.values["retry-failed"] ?? false,
    help: parsed.values.help ?? false,
  };
  if (parsed.values.account !== undefined)
    options.account = parsed.values.account;
  if (parsed.values.limit !== undefined)
    options.limit = limitSchema.parse(parsed.values.limit);
  return options;
}

export async function main(
  args: string[] = process.argv.slice(2),
): Promise<void> {
  const options = parseCliOptions(args);
  if (options.help) {
    printHelp();
    return;
  }

  const config = loadConfig();
  const logger = createLogger(config);
  const accountLoad = await loadAccounts(config.accountsFile);
  for (const issue of accountLoad.issues) {
    logger.warn(
      { row: issue.row, issue: issue.message },
      "Account input row skipped or normalized",
    );
  }
  if (accountLoad.accounts.length === 0) {
    throw new Error(`No valid accounts were found in ${config.accountsFile}`);
  }

  const progressStore = new ProgressStore(config.progressFile);
  const resultStore = new ResultStore(config.resultsFile);
  await progressStore.load();
  await resultStore.load();

  const queue = new WorkerQueue(config, progressStore, resultStore, logger);
  let signalReceived = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    signalReceived = true;
    logger.warn({ signal }, "Shutdown signal received");
    queue.requestShutdown();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  try {
    await queue.run(accountLoad.accounts, options);
    if (signalReceived) process.exitCode = 130;
  } finally {
    process.removeListener("SIGINT", shutdown);
    process.removeListener("SIGTERM", shutdown);
    logger.flush();
  }
}
