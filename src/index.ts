import { main } from "./main.js";

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Fatal worker error: ${message}\n`);
  process.exitCode = 1;
});
