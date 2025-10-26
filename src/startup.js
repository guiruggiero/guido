// Imports
import {execSync} from "node:child_process";
import os from "node:os";
import * as Sentry from "@sentry/node";

// Get current commit hash
function getCurrentCommit() {
    let currentCommit = "";
    try {
        currentCommit = execSync("git rev-parse --short HEAD", {env: {PATH: "/usr/bin:/bin:/usr/local/bin"}}).toString().trim();

    } catch (error) {
        console.warn("Failed to get current commit hash:", error.message);
        currentCommit = "unknown";
    }

    process.env.CURRENT_COMMIT = currentCommit;
}

// Get current environment
function getCurrentEnv() {
    let hostname = "";
    try {
        hostname = os.hostname();

    } catch (error) {
        console.warn("Failed to get hostname, defaulting to 'prod':", error.message);
    }

    process.env.ENV = hostname === "code-server" ? "dev" : "prod";
}

// Instrument error tracking
function instrumentErrTracking() {
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        release: process.env.CURRENT_COMMIT,
        environment: process.env.ENV,
        integrations: [Sentry.mongoIntegration()],
        sendDefaultPii: true,
        tracesSampleRate: 1.0,
        enableLogs: true,
    });

    console.log("Error tracking instrumented");
}

getCurrentCommit();
getCurrentEnv();
instrumentErrTracking();