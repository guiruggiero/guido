# GuiDo Codebase Reference

## What This Project Is

GuiDo is a WhatsApp AI assistant. Incoming WhatsApp messages arrive via a Vonage webhook, get processed by Gemini (via Langfuse-managed prompts), and may trigger tool calls (Splitwise expense creation, calendar events, etc.) before a reply is sent back through Vonage. Conversation context is persisted per-task in MongoDB.

The same app also serves **Guindex** (`POST /guindex`), a separate webhook for the Pebble Index 01 voice recorder that turns a button-press transcription into a single forced tool call — see the Guindex section below.

## Architecture

**Request lifecycle** (all in `app.js`):
1. Vonage sends a POST to the webhook — rate-limited to 20 requests per 10 minutes per IP (`guidoRateLimit`, its own bucket separate from Guindex's), then signature is verified via `validateWhatsAppAuth` (`auth.js`)
2. 200 OK is sent immediately (Vonage requires fast acknowledgment)
3. `receiveMessage` validates the sender phone number, sanitizes text or fetches media
4. `getTaskHistory` retrieves or creates an active MongoDB task (conversation context)
5. `callLLM` sends history + dynamic prompt to Gemini, loops through tool calls
6. Each tool call dispatches via the `toolHandlers` registry in `llmCaller.js`
7. `sendMessage` sends the final reply via Vonage
8. `updateTaskHistory` persists the new messages to MongoDB

**Key source files** (all under `src/`):

| File | Role |
|---|---|
| `app.js` | Express server, both webhook routes, orchestration loop |
| `auth.js` | `validateWhatsAppAuth` (Vonage JWT signature) and `validateIndexAuth` (Index 01 bearer token middleware) |
| `guindex.js` | Pebble Index 01 transcription handler: forced tool call, then WhatsApp confirmation |
| `llmCaller.js` | Gemini API calls, Langfuse tracing, tool registry + dispatch loop |
| `messageHandler.js` | Vonage integration, message parsing, media handling |
| `databaseHandler.js` | MongoDB task CRUD, conversation history |
| `promptFetcher.js` | Fetches and caches prompts from Langfuse, shared by app and scripts |
| `startup.js` | Sentry + OpenTelemetry init, environment detection |

**Tools** (under `src/tools/`, one file per tool):

Each tool file exports `definition` (Gemini function declaration) and `handler` (async execution function). Tool names are camelCase. `llmCaller.js` imports all tools, builds a `functionDeclarations` array and `toolHandlers` map, and dispatches by name.

| File | Tool |
|---|---|
| `tools/addToCalendar.js` | Creates Google Calendar events, via Guiddleware |
| `tools/summarize.js` | Creates concise summaries of messages |
| `tools/addToSplitwise.js` | Adds expenses to Splitwise, via Guiddleware |
| `tools/addReminder.js` | Adds a to-do item to Google Tasks, via Guiddleware |
| `tools/completeTask.js` | Marks a task as completed |
| `tools/askClaudeCode.js` | Forwards a coding task/question to Claude Code, via the Claude Code Gateway |
| `tools/trackFlight.js` | Gets a FlightAware live-tracking link, via Guiddleware |
| `tools/getLockStatus.js` | Gets the front door lock's status, via Home Assistant |
| `tools/lockDoor.js` | Locks the front door, via Home Assistant |
| `tools/unlockDoor.js` | Unlocks the front door, via Home Assistant |
| `tools/addToTrello.js` | Creates a Trello card, via Guiddleware |
| `tools/searchTrelloCards.js` | Searches Trello card titles for an ID, via Guiddleware |
| `tools/editTrelloCard.js` | Renames, notes, or moves an existing Trello card, via Guiddleware |

**Utilities** (under `src/utils/`):

| File | Role |
|---|---|
| `utils/axiosClient.js` | HTTP retry client factory with exponential backoff |
| `utils/guiddleware.js` | Axios client for the shared Guiddleware service (`guiruggiero/guiddleware`): `createReminder(payload)` (Google Tasks), `createExpense(payload)` (Splitwise), `createCalendarEvent(payload)`, `getFlightAwareUrl(flightNumber)`, `createTrelloCard(payload)`, `searchTrelloCards(query, limit?)`, `updateTrelloCard(id, payload)` |
| `utils/claudeCode.js` | Axios client for the Claude Code Gateway (`guiruggiero/guiddleware`, `claude-code/`, runs on code-server): `runPrompt(prompt)` |
| `utils/homeAssistant.js` | Axios client for Home Assistant's REST API, running as a Docker container on runtime-server (same box as GuiDo, loopback-only — not reached via Guiddleware): `getLockState()`, `lockDoor()`, `unlockDoor()` |

Splitwise and Google Calendar used to have their own local clients here (`utils/splitwise.js`, a Calendar stub) — both now go through Guiddleware instead, which also means `addToSplitwise` gained split/uneven-split support GuiDo never had before (previously solo-expense only).

**Guindex** (`POST /guindex`, handler in `guindex.js`) is a second, independent entry point for the Pebble Index 01 smart ring — not part of the WhatsApp flow above:
1. The Index posts `multipart/form-data` (`transcription`, `recordedAt` as ms since epoch; audio is deliberately not sent, so the route uses `upload.none()`)
2. `validateIndexAuth` checks a plain bearer token against `INDEX_WEBHOOK_SECRET` — separate from the Vonage JWT path, and returns 401 rather than 200 (the Index doesn't retry or read response bodies)
3. 200 is sent immediately, then `handleGuindex` runs async
4. One `generateContent` call to `gemini-flash-latest` with `FunctionCallingConfigMode.ANY` — forced single tool call, no chat history, no clarifying questions possible
5. The first tool call is executed, then a WhatsApp confirmation is sent via `sendMessage`

Guindex keeps its own tool subset (`addReminder`, `addToCalendar`, `addToSplitwise`, `addToTrello`, `trackFlight`, `lockDoor`) and its own registry/dispatch, deliberately separate from `llmCaller.js`'s. `unlockDoor` and `getLockStatus` are excluded on purpose: with forced tool calling and no way to ask a clarifying question, a misheard transcription should never be able to unlock the door — locking is the only fail-safe direction. Errors are caught inside `handleGuindex` and reported to the user over WhatsApp, since there's nowhere else to surface them.

**Environment detection** (`startup.js`): `process.env.ENV` is `"dev"` only if `APP_ENV=dev` is set (the `dev` npm script does this); everything else, including the runtime-server (which sets nothing), is `"prod"`. Controls the Langfuse prompt label (`"latest"` vs `"production"`) and the Mongo database name, and informs Sentry and Langfuse tracing.

**Media handling**: media files (image, audio, file) are fetched from Vonage and saved to `media/{messageId}.{ext}` on disk (TODO: migrate to Google Cloud Storage). In MongoDB, only the filename is stored as the message `content`, not the base64 data. When replaying history to the LLM, `prepareForLLM` formats media turns as `[type: filename]` (e.g., `[image: abc123.jpg]`).

**Secrets** are managed by Infisical CLI (one environment, `dev`, used everywhere — the dev/prod split above is just a Langfuse prompt label, not a separate secret store). The app reads `process.env` for `VONAGE_*`, `GEMINI_API_KEY`, `MONGODB_URI`, `SENTRY_DSN`, `LANGFUSE_*`, `APP_PATH`, `EXPRESS_PORT`, `PHONE_NUMBER`, `GUIDDLEWARE_URL`, `GUIDDLEWARE_SECRET_GUIDO`, `CLAUDE_CODE_GATEWAY_URL`, `CLAUDE_CODE_GATEWAY_SECRET_GUIDO`, `HOME_ASSISTANT_BASE_URL`, `HOME_ASSISTANT_TOKEN`, `HOME_ASSISTANT_LOCK_ENTITY_ID`, `INDEX_WEBHOOK_SECRET`.

**Lock control** (`utils/homeAssistant.js`) wraps an unofficial API one layer removed (Home Assistant → August's cloud API), so occasional failures are expected — errors propagate to `llmCaller.js`'s generic tool-call catch, which logs to Sentry and lets the LLM phrase a "couldn't reach it" reply rather than a raw error. Convenience-tier only, not safety-critical automation. If the August integration itself breaks, check `alerts.home-assistant.io/alerts/august/` and GitHub issues on `home-assistant/core` filtered to "august" before assuming it's a GuiDo-side bug.

**Prompt management**: `promptGuiDo.md` (WhatsApp conversational prompt) and `promptGuindex.md` (Pebble Index 01 forced-tool-call prompt) are managed via `npm run prompt-pull`/`prompt-push`, which sync both files in one go via `scripts/promptSync.js`, and are excluded from regular commits. Always perform changes to system prompts, but never consider them in the commit message. Scripts run via Infisical to inject `LANGFUSE_*` secrets.

## Deployment

Triggered by pushing to the `prod` branch (or manual dispatch via `.github/workflows/bundle-and-deploy.yml`):
1. ESBuild bundles to `dist/app.js`; source maps uploaded to Sentry, then deleted
2. Production bundle force-pushed to the `prod-min` branch
3. Server pulls from `prod-min` and restarts via PM2

**Sentry:** Errors logged to the `guido` project (`GUIDO-*` issue IDs).

**SonarQube Cloud**: project key `guiruggiero_guido`.
