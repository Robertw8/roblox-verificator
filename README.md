# Roblox Age-Verification Queue Worker

A resumable, human-in-the-loop queue worker built with TypeScript, Node.js, Playwright, Zod, Pino, and CSV storage. It automates normal navigation and account isolation. A real operator must complete every selfie/camera/liveness step in the visible Chromium window.

Use this only for accounts you own or are explicitly authorized to manage, and comply with Roblox's terms, privacy requirements, and applicable law. The worker does not bypass CAPTCHA, liveness, identity, or other security controls.

## Requirements

- Node.js 22 or newer
- npm
- A desktop session with camera access
- Permission to access and verify every account in the input file

## Installation

```bash
npm install
npx playwright install chromium
npm run build
```

Copy the environment template if you want to override defaults:

```bash
cp .env.example .env
```

## Account input

Create `data/accounts.csv` using UTF-8 CSV with exactly these columns:

```csv
username,password
account001,password1
account002,password2
```

`data/accounts.example.csv` is safe to copy as a starting point. Invalid, malformed, and duplicate rows are logged by row number and skipped; passwords are never included in logs. A legacy headerless two-column file is accepted with a warning, but adding the required header is recommended.

`data/accounts.csv`, results, progress, screenshots, and traces are ignored by Git because they can contain credentials or personal information. Protect these local files and rotate any credentials that have been exposed elsewhere.

## Configuration

| Variable                        |  Default | Purpose                                           |
| ------------------------------- | -------: | ------------------------------------------------- |
| `HEADLESS`                      |  `false` | Keeps Chromium visible for the operator           |
| `MAX_RETRIES`                   |      `2` | Transient retries after the first attempt         |
| `LOGIN_TIMEOUT_MS`              |  `30000` | Login outcome deadline                            |
| `NAVIGATION_TIMEOUT_MS`         |  `30000` | Browser action/navigation deadline                |
| `HUMAN_VERIFICATION_TIMEOUT_MS` | `180000` | Time allowed for manual camera verification       |
| `RESULT_TIMEOUT_MS`             |  `60000` | Time to wait for Roblox's result after completion |
| `RETRY_BASE_DELAY_MS`           |   `2000` | Initial retry backoff                             |
| `RETRY_MAX_DELAY_MS`            |  `15000` | Backoff cap                                       |
| `TRACE_ON_FAILURE`              |  `false` | Saves a Playwright trace for failed attempts      |
| `LOG_LEVEL`                     |   `info` | Pino log level                                    |
| `LOG_PRETTY`                    |   `true` | Human-readable logs; use `false` for JSON         |

The paths `ACCOUNTS_FILE`, `RESULTS_FILE`, `PROGRESS_FILE`, `SCREENSHOTS_DIR`, and `TRACES_DIR` are also configurable. Relative paths resolve from the current working directory.

## Running the worker

```bash
npm run start
npm run start -- --resume
npm run start -- --retry-failed
npm run start -- --account account001
npm run start -- --limit 10
```

Accounts run sequentially. One Chromium browser is shared, but every attempt gets a fresh `BrowserContext`; cookies, local storage, cache, and authenticated state are never reused across accounts.

When the camera flow is ready, the worker prints a prominent `WAITING_FOR_HUMAN` message. Complete the selfie flow in the browser. Do not press Enter: the worker watches the original page, new pages, popups, redirects, and frames and continues when it detects a terminal result or provider completion.

## Resume and retry behavior

`data/progress.json` is atomically rewritten after every explicit state transition. `data/results.csv` is atomically updated immediately after each terminal account result.

On every start, accounts with no terminal result are eligible to run, so safe resume behavior is the default. `--resume` makes that intent explicit. Existing `verified` and `already_verified` results are always skipped. Other existing terminal results are skipped unless `--retry-failed` is supplied; that flag gives them a fresh retry budget and upserts their prior result row.

Only transient failures such as navigation and result timeouts are retried with capped exponential backoff. Invalid credentials, security challenges, account restrictions, and explicitly unavailable selfie verification are not retried automatically. One account failure does not stop the queue.

`SIGINT` and `SIGTERM` request graceful shutdown. Polling stops quickly, the current state remains resumable, progress is persisted, the context and browser close, and result CSV writes are never left partial.

## Output

`data/results.csv` uses this schema:

```csv
username,status,ageGroup,attempts,error,processedAt
account001,verified,18-20,1,,2026-08-19T18:31:00.000Z
account002,failed,,1,invalid_credentials,2026-08-19T18:34:00.000Z
```

Statuses are `verified`, `failed`, `timeout`, `not_available`, `already_verified`, `manual_review`, or `unknown`. Age extraction accepts ranges and plus-groups generally rather than limiting output to `18-20` and `21+`.

## Debugging

For account-level failures, the worker logs the username, explicit state, current URL, and a sanitized error code, then saves a screenshot such as:

```text
screenshots/account001_OPEN_SETTINGS_20260819T183100000Z.png
```

Set `TRACE_ON_FAILURE=true` to also write `traces/<username>_<timestamp>.zip`. Inspect a trace locally with:

```bash
npx playwright show-trace traces/example.zip
```

Diagnostics may contain personal account data. They are ignored by Git and should be retained only as long as needed.

## Architecture

```text
src/
├── index.ts                 # executable boundary
├── main.ts                  # CLI, config, stores, signals
├── config.ts                # Zod environment validation
├── types.ts                 # account, state, and result types
├── worker/
│   ├── AccountWorker.ts     # one isolated account attempt
│   ├── WorkerQueue.ts       # selection, resume, retries, browser lifecycle
│   └── state.ts             # allowed state transitions
├── roblox/
│   ├── login.ts
│   ├── logout.ts
│   ├── settings.ts
│   ├── ageVerification.ts
│   └── selectors.ts         # centralized UI text and locator candidates
├── storage/
│   ├── accountLoader.ts
│   ├── resultStore.ts
│   ├── progressStore.ts
│   └── atomicWrite.ts
└── utils/
    ├── errors.ts
    ├── logger.ts
    └── retry.ts
```

Run local validation with:

```bash
npm run format:check
npm run typecheck
npm test
npm run build
```

Unit tests cover CSV validation, atomic result upserts, progress persistence, retry policy, state transitions, resume selection, and age-result parsing. They do not contact Roblox.

## Known limitations

- Roblox and third-party verification-provider UI can change without notice. All likely-to-change text, roles, attributes, and URLs are isolated in `src/roblox/selectors.ts` and `src/roblox/ageVerification.ts`; the first authorized live run may reveal wording that needs a small selector update.
- CAPTCHA and login security challenges are detected and recorded, not solved.
- Camera permission and device selection remain under browser/OS control.
- A provider that neither closes/redirects nor exposes completion text can reach the configured human timeout even after the operator finishes. The saved screenshot/trace should identify the provider-specific completion signal to add.
- The automated test suite intentionally does not exercise Roblox production, real credentials, a camera, or liveness verification.
