// Imports
import {execSync} from "node:child_process";
import os from "node:os";
import * as Sentry from "@sentry/node";
import {NodeSDK} from "@opentelemetry/sdk-node";
import {LangfuseSpanProcessor} from "@langfuse/otel";

// Get current commit hash
let currentCommit = "";
try {
    currentCommit = execSync("git rev-parse --short HEAD", {env: {PATH: "/usr/bin:/bin:/usr/local/bin"}}).toString().trim();

} catch (error) {
    console.warn("Failed to get current commit hash:", error.message);
    currentCommit = "unknown";
}

process.env.CURRENT_COMMIT = currentCommit;

// Get current environment
let hostname = "";
try {
    hostname = os.hostname();

} catch (error) {
    console.warn("Failed to get hostname, defaulting to 'prod':", error.message);
}

process.env.ENV = hostname === "code-server" ? "dev" : "prod";

// Instrument error tracking
Sentry.init({
    dsn: process.env.SENTRY_DSN,
    release: process.env.CURRENT_COMMIT,
    environment: process.env.ENV,
    sendDefaultPii: true,
    tracesSampleRate: 1.0,
    enableLogs: true,
    integrations: [
        Sentry.mongoIntegration(),
        Sentry.googleGenAIIntegration({
            recordInputs: true,
            recordOutputs: true,
        }),
    ],
});

console.log("Error tracking instrumented");

// Initialize observability
const sdk = new NodeSDK({spanProcessors: [new LangfuseSpanProcessor()]});
sdk.start();

console.log("Observability instrumented");

// Add shutdown handler directly in startup.js
process.on("SIGINT", async () => await sdk.shutdown());
process.on("SIGTERM", async () => await sdk.shutdown());