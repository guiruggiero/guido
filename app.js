// Imports
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import multer from "multer";
import {validateWhatsAppAuth, validateIndexAuth} from "./src/auth.js";
import {receiveMessage, sendMessage} from "./src/messageHandler.js";
import {getTaskHistory, updateTaskHistory, cleanupDatabase} from "./src/databaseHandler.js";
import {callLLM} from "./src/llmCaller.js";
import {handleGuindex} from "./src/guindex.js";
import {reportError} from "./src/utils/reportError.js";
import * as Sentry from "@sentry/node";
import {langfuseProvider} from "./src/startup.js";

// Express app
const app = express();
app.use(express.json({limit: "1mb"})); // POST request parser with size limit
app.use(helmet()); // HTTP header security
app.set("trust proxy", 1); // Trust exactly one hop (cloudflared) so rate limiting keys on the real client IP

// Parser for multipart/form-data type
const upload = multer({limits: {fieldSize: 64 * 1024, fields: 3, files: 0, parts: 3}}); // transcription, recordedAt, client

// Rate limiters (by IP), one bucket per endpoint
const rateLimitConfig = {
    windowMs: 10 * 60 * 1000, // 10 minutes
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => res.status(429).send("Too many requests"),
};
const guidoRateLimit = rateLimit({...rateLimitConfig, limit: 20});
const guindexRateLimit = rateLimit({...rateLimitConfig, limit: 20});

// GuiDo endpoint
app.post(process.env.APP_PATH, guidoRateLimit, async (req, res) => {
    try {
        // Validate message signature
        validateWhatsAppAuth(req);

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

        // Auth failures never get a reply
        if (error.isAuthError) return;

        // Send friendly error message to user
        try {await sendMessage(error.userMessage);}
        catch {/* ignore, nothing more we can do */}
    }
});

// Guindex transcription endpoint
app.post("/guindex", guindexRateLimit, validateIndexAuth, upload.none(), (req, res) => { // No audio file
    // Acknowledge receipt
    res.status(200).end();

    // Process async
    const {transcription, recordedAt} = req.body ?? {}; // Undefined if the caller didn't send multipart
    if (!transcription) return;
    handleGuindex(transcription, recordedAt);
});

// Status endpoint
app.get(process.env.APP_PATH, guidoRateLimit, (req, res) => {
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