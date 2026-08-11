// Imports
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import {validateSignature} from "./src/auth.js";
import {receiveMessage, sendMessage} from "./src/messageHandler.js";
import {getTaskHistory, updateTaskHistory, cleanupDatabase} from "./src/databaseHandler.js";
import {callLLM} from "./src/llmCaller.js";
import {reportError} from "./src/utils/reportError.js";
import * as Sentry from "@sentry/node";
import {langfuseProvider} from "./src/startup.js";

// Express app
const app = express();
app.use(express.json({limit: "1mb"})); // POST request parser with size limit
app.use(helmet()); // HTTP header security

// Rate limiter (by IP)
const webhookRateLimit = rateLimit({
    limit: 20,
    windowMs: 10 * 60 * 1000, // 10 minutes
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => res.status(429).send("Too many requests"),
});

// Inbound message endpoint
app.post(process.env.APP_PATH, webhookRateLimit, async (req, res) => {
    try {
        // Validate message signature
        validateSignature(req);

        // Acknowledge receipt
        res.status(200).end();

        // Parse and sanitize message
        const message = await receiveMessage(req.body);

        // Respond with error message if validation fails
        if (message.validation !== "OK") {
            await sendMessage(message.validation);
            return;
        }

        // Get task history and ID from database
        const {taskHistory, taskID} = await getTaskHistory(message.timestamp);
        message.taskHistory = taskHistory;

        // Call LLM
        const llmResult = await callLLM(message);
        message.response = llmResult.response;
        // message.response = "Bla bla bla my brother";

        // Respond back
        await sendMessage(message.response);

        // Update task on database
        await updateTaskHistory(message, taskID, llmResult.taskStatus);
    
    } catch (error) {
        // Acknowledge receipt if not already done
        if (!res.headersSent) res.status(200).end();

        // Unhandled error
        if (!error.userMessage) {
            reportError("unknown", error, {userMessage: "❌ Unknown error"});
        }

        // Auth failures never get a reply - an unauthenticated caller shouldn't be able to make the bot message its owner
        if (error.isAuthError) return;

        // Send friendly error message to user
        try {await sendMessage(error.userMessage);}
        catch {/* ignore, nothing more we can do */}
    }
});

// App status endpoint
app.get(process.env.APP_PATH, webhookRateLimit, (req, res) => {
    res.status(200).send(`GuiDo is up and running! (commit: <b>${process.env.CURRENT_COMMIT}</b>)`);
});

// Middleware for error tracking
Sentry.setupExpressErrorHandler(app);

// Start the server
const server = app.listen(process.env.EXPRESS_PORT, () => {
    console.log(`GuiDo running on port ${process.env.EXPRESS_PORT}`);

    if (process.send) process.send("ready"); // If in prod, let PM2 know app is ready
});

// Graceful shutdown
function gracefulShutdown() {
    console.log("");

    // Force exit if shutdown hangs
    setTimeout(() => process.exit(1), 10000).unref();

    // Stop accepting new connections, wait for in-flight requests to finish
    server.close(async () => {
        console.log("Server shut down");

        // Flush observability traces and error events
        await langfuseProvider.shutdown();
        await Sentry.close(2000);

        // Shut down database
        await cleanupDatabase();

        process.exit(0);
    });
}

// Handle termination signals
process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);