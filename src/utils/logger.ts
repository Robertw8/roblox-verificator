import pino, { type Logger, type LoggerOptions } from "pino";
import type { Config } from "../config.js";

const REDACT_PATHS = [
  "password",
  "account.password",
  "accounts[*].password",
  "req.headers.authorization",
  "headers.authorization",
];

export function createLogger(
  config: Pick<Config, "logLevel" | "logPretty">,
): Logger {
  const options: LoggerOptions = {
    level: config.logLevel,
    redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
  };

  if (!config.logPretty) return pino(options);

  return pino(
    options,
    pino.transport({
      target: "pino-pretty",
      options: {
        colorize: process.stdout.isTTY,
        ignore: "pid,hostname",
        singleLine: true,
        translateTime: "SYS:standard",
      },
    }),
  );
}
