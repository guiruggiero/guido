// Imports
import {execSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import * as Sentry from "@sentry/node";
import {NodeTracerProvider} from "@opentelemetry/sdk-trace-node";
import {LangfuseSpanProcessor} from "@langfuse/otel";
import {setLangfuseTracerProvider} from "@langfuse/tracing";

// ESM path resolution
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Get current commit hash from build-time file, fall back to git for dev environment
let currentCommit;
try {
    currentCommit = readFileSync(path.join(__dirname, "commit.txt"), "utf-8").trim();

} catch {
    try {
        currentCommit = execSync("git rev-parse --short HEAD", {env: {PATH: "/usr/bin:/bin:/usr/local/bin"}}).toString().trim();

    } catch (error) {
        // Sentry isn't initialized yet
        console.warn(`Failed to get current commit hash: ${error.message}`);
        currentCommit = "unknown";
    }
}

process.env.CURRENT_COMMIT = currentCommit;

// Get current environment
process.env.ENV = process.env.APP_ENV === "dev" ? "dev" : "prod";

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

// Initialize observability isolated from Sentry's global OTel (still inherits tracesSampleRate)
export const langfuseProvider = new NodeTracerProvider({
    spanProcessors: [new LangfuseSpanProcessor({environment: process.env.ENV, release: process.env.CURRENT_COMMIT})],
});
setLangfuseTracerProvider(langfuseProvider);

console.log("Observability instrumented");
Sentry.logger.info("Observability instrumented");