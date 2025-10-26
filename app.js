// Imports
import {cleanupDatabase} from "./src/databaseHandler.js";
import express from "express";
import helmet from "helmet";
import {xss} from "express-xss-sanitizer";
import * as Sentry from "@sentry/node";

// Set up graceful shutdown
process.on("SIGINT", async () => {
    try {
        await cleanupDatabase();
        process.exit(0);

    } catch {
        process.exit(1);
    }
});

// Initialize server and middleware
const app = express();
app.use(express.urlencoded({extended: false, limit: "1mb"})); // POST request parser with size limit
app.use(helmet()); // HTTP header security
app.use(xss()); // XSS protection

// Webhook endpoint
app.post(process.env.APP_PATH, async (req, res) => {
    res.status(200).send("Hello world!"); // TODO: implement
});

// Status check endpoint
app.get(process.env.APP_PATH, (req, res) => {
    res.status(200).send("GuiDo is up and running! (commit: <b>" + process.env.CURRENT_COMMIT + "</b>)");
});

// Middleware for error tracking
Sentry.setupExpressErrorHandler(app);

// Start the server
app.listen(process.env.EXPRESS_PORT, () => {
    console.log("GuiDo running on port", process.env.EXPRESS_PORT);

    if (process.send) process.send("ready"); // If in prod, let PM2 know app is ready
});