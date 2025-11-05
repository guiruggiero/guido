// Imports
import express from "express";
import helmet from "helmet";
import {validateSignature, receiveMessage, sendMessage} from "./src/messageHandler.js";
import {getTaskHistory, updateTaskHistory} from "./src/databaseHandler.js";
import {callLLM} from "./src/llmCaller.js";
import * as Sentry from "@sentry/node";

// Initialize server and middleware
const app = express();
app.use(express.json({limit: "1mb"})); // POST request parser with size limit
app.use(helmet()); // HTTP header security

// Inbound message endpoint
app.post(process.env.APP_PATH, async (req, res) => {
    try {
        // Validate message signature
        validateSignature(req);

        // Acknowledge receipt
        res.status(200).end();

        // Parse and sanitize message
        const message = await receiveMessage(req.body);

        // Respond with error message if validation fails
        if (message.validation !== "OK") {
            sendMessage(message.validation);
            return;
        }

        // Get task history and ID from database
        const {taskHistory, taskID} = await getTaskHistory(message.timestamp);
        message.taskHistory = taskHistory;

        // Call LLM
        message.response = await callLLM(message);
        // message.response = "Bla bla bla my brother";

        // Respond back
        sendMessage(message.response);

        // Update task on database
        await updateTaskHistory(message, taskID);
    
    } catch (error) {
        // Acknowledge receipt if not already done
        if (!res.headersSent) res.status(200).end();

        // Unhandled error
        if (!error.userMessage) {
            Sentry.withScope((scope) => {
                scope.setTag("operation", "unknown");
                Sentry.captureException(error);
            });

            error.userMessage = "❌ Unknown error";
        }

        // Send friendly error message to user
        sendMessage(error.userMessage);
    }
});

// App status endpoint
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