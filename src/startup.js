// Imports
import {execSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import os from "node:os";
import * as Sentry from "@sentry/node";
import {NodeSDK} from "@opentelemetry/sdk-node";
import {LangfuseSpanProcessor} from "@langfuse/otel";

// ESM path resolution
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Get current commit hash - prefer the build-time file (CI writes this from github.sha, since the deploy
// bundle strips everything but startup.js and .git may not reflect the original source commit); fall back
// to git for local dev, where no such file exists
let currentCommit;
try {
    currentCommit = readFileSync(path.join(__dirname, "commit.txt"), "utf-8").trim();

} catch {
    try {
        currentCommit = execSync("git rev-parse --short HEAD", {env: {PATH: "/usr/bin:/bin:/usr/local/bin"}}).toString().trim();

    } catch (error) {
        // Sentry isn't initialized yet at this point in startup, so this can only go to the console
        console.warn(`Failed to get current commit hash: ${error.message}`);
        currentCommit = "unknown";
    }
}

process.env.CURRENT_COMMIT = currentCommit;

// Get current environment
let hostname = "";
try {
    hostname = os.hostname();

} catch (error) {
    console.warn(`Failed to get hostname, defaulting to "prod": ${error.message}`);
}

process.env.ENV = hostname === "code-server" ? "dev" : "prod";

// Instrument error tracking
Sentry.init({
    dsn: process.env.SENTRY_DSN,
    release: process.env.CURRENT_COMMIT,
    environment: process.env.ENV,
    dataCollection: {userInfo: false, cookies: false},
    tracesSampleRate: 1.0,
    enableLogs: true,
    integrations: [Sentry.mongoIntegration()],
});

console.log("Error tracking instrumented");
Sentry.logger.info("Error tracking instrumented");

// Initialize observability
export const sdk = new NodeSDK({spanProcessors: [new LangfuseSpanProcessor()]});
sdk.start();

console.log("Observability instrumented");
Sentry.logger.info("Observability instrumented");