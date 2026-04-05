# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

GuiDo is a WhatsApp AI assistant. Incoming WhatsApp messages arrive via a Vonage webhook, get processed by Gemini (via Langfuse-managed prompts), and may trigger tool calls (Splitwise expense creation, calendar events, etc.) before a reply is sent back through Vonage. Conversation context is persisted per-task in MongoDB.

## Commands

```bash
npm run dev       # Start with nodemon + Infisical secrets (requires Infisical CLI)
npm run build     # Bundle with ESBuild → dist/app.js
npm run start     # Run production build with Infisical secrets
npm run lint      # ESLint
npm run tunnel    # Expose localhost via ngrok (requires ngrok profile named "guido")
```


## Architecture

**Request lifecycle** (all in `app.js`):
1. Vonage sends a POST to the webhook — signature is verified via `validateSignature`
2. 200 OK is sent immediately (Vonage requires fast acknowledgment)
3. `receiveMessage` validates the sender phone number, sanitizes text or fetches media
4. `getTaskHistory` retrieves or creates an active MongoDB task (conversation context)
5. `callLLM` sends history + dynamic prompt to Gemini, loops through tool calls
6. Each tool call dispatches to `handleTool` in `modelTools.js`
7. `sendMessage` sends the final reply via Vonage
8. `updateTaskHistory` persists the new messages to MongoDB

**Key source files** (all under `src/`):

| File | Role |
|---|---|
| `app.js` | Express server, webhook route, orchestration loop |
| `messageHandler.js` | Vonage integration, message parsing, media handling |
| `databaseHandler.js` | MongoDB task CRUD, conversation history |
| `llmCaller.js` | Gemini API calls, Langfuse tracing, tool-call loop |
| `modelTools.js` | Tool definitions (Gemini function declarations) and handlers |
| `promptFetcher.js` | Fetches and caches prompts from Langfuse |
| `startup.js` | Sentry + OpenTelemetry init, environment detection |

**Environment detection** (`startup.js`): hostname `"code-server"` → dev; otherwise → prod. This controls Langfuse prompt label (`"latest"` vs `"production"`).

**Secrets** are managed by Infisical CLI. The app reads `process.env` for `VONAGE_*`, `GEMINI_API_KEY`, `MONGODB_URI`, `SENTRY_DSN`, `SPLITWISE_API_KEY`, `LANGFUSE_*`, `APP_PATH`, `EXPRESS_PORT`, `PHONE_NUMBER`.

## Deployment

Triggered by pushing to the `prod` branch (or manual dispatch via `.github/workflows/bundle-and-deploy.yml`):
1. ESBuild bundles to `dist/app.js`; source maps uploaded to Sentry, then deleted
2. Production bundle force-pushed to the `prod-min` branch
3. Server pulls from `prod-min` and restarts via PM2

**Sentry:** Errors logged to the `guido` project (`GUIDO-*` issue IDs).
