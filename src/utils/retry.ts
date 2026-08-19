import { setTimeout as delay } from "node:timers/promises";
import { ShutdownError, type WorkerError } from "./errors.js";

export function shouldRetry(
  error: WorkerError,
  attemptNumber: number,
  maxRetries: number,
): boolean {
  return error.retriable && attemptNumber <= maxRetries;
}

export function retryDelayMs(
  retryNumber: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  return Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, retryNumber - 1));
}

export async function sleepWithShutdown(
  milliseconds: number,
  isShutdownRequested: () => boolean,
): Promise<void> {
  const intervalMs = Math.min(500, milliseconds);
  let remaining = milliseconds;
  while (remaining > 0) {
    if (isShutdownRequested()) throw new ShutdownError();
    const currentDelay = Math.min(intervalMs, remaining);
    await delay(currentDelay);
    remaining -= currentDelay;
  }
}
