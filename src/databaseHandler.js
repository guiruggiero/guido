// Imports
import {MongoClient, ServerApiVersion} from "mongodb";
import * as Sentry from "@sentry/node";
import {reportError} from "./utils/reportError.js";

// Database connection config with Stable API version
const mongoOptions = {
    minPoolSize: 1,
    maxPoolSize: 2,
    maxIdleTimeMS: 60000, // 60s
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
};

// Initialize database connection and collection
let mongoConnection = null;
let tasks = null;
try {
    // Initialize MongoDB client
    const client = new MongoClient(process.env.MONGODB_URI, mongoOptions);

    // Connect and confirm successful connection
    await client.connect();
    await client.db("admin").command({ping: 1});

    mongoConnection = client;

    // Get task collection
    tasks = mongoConnection.db(process.env.ENV).collection("tasks");

    // Enforce at most one active task at a time (single-user bot) - backs the upsert race guard below
    await tasks.createIndex({status: 1}, {unique: true, partialFilterExpression: {status: "in_progress"}});

    console.log("Database connection established");
    Sentry.logger.info("Database connection established");

} catch (error) {
    console.error("Failed to established database connection");
    Sentry.logger.error("Failed to establish database connection", {error: error.message});

    // Rethrow to stop execution
    throw error;
}

// Shut down database connection
export async function cleanupDatabase() {
    if (mongoConnection) {
        try {
            await mongoConnection.close();
            mongoConnection = null;
            console.log("Database connection shut down");
            Sentry.logger.info("Database connection shut down");

        } catch (error) {
            console.error("Failed to shut down database connection");
            Sentry.logger.error("Failed to shut down database connection", {error: error.message});

            // Rethrow to send correct exit code
            throw error;
        }
    }
}

// Prepare task history for LLM call
function prepareForLLM(taskHistory) {
    return taskHistory.map(msg => ({
        role: msg.role,
        parts: (msg.role === "user" && msg.type !== "text")
            ? [{text: `[${msg.type}: ${msg.content}]`}]
            : [{text: msg.content}],
    }));
}

// Prepare messages to be stored
function prepareForStorage(message, timestamp) {
    // Explicit coercions keep user-derived values as plain strings (not MongoDB operators)
    const allowedTypes = new Set(["text", "audio", "image", "file"]);
    const safeType = allowedTypes.has(message.type) ? message.type : "text";

    const userMessage = {
        whatsappId: String(message.id),
        timestamp: message.timestamp,
        type: safeType,
        role: "user",
        content: safeType === "text" ? String(message.content) : `${String(message.id)}.${String(message.extension)}`,
    };

    const modelMessage = {
        timestamp: timestamp,
        role: "model",
        content: String(message.response),
    };

    return [userMessage, modelMessage];
}

// Atomically find the active task or create one, closing the race between two near-simultaneous messages
async function getOrCreateActiveTask(timestamp) {
    try {
        return await tasks.findOneAndUpdate(
            {status: "in_progress"},
            {$setOnInsert: {
                started: timestamp,
                updated: timestamp,
                status: "in_progress",
                messages: [],
            }},
            {
                upsert: true,
                returnDocument: "after",
                projection: {messages: 1, _id: 1}, // Restrict fields to be returned
            },
        );

    } catch (error) {
        // Two requests raced the upsert - the other one won, just fetch what it created
        if (error.code === 11000) {
            return tasks.findOne(
                {status: "in_progress"},
                {projection: {messages: 1, _id: 1}},
            );
        }

        throw error;
    }
}

export async function getTaskHistory(timestamp) {
    try {
        const activeTask = await getOrCreateActiveTask(timestamp);

        // Prepare task history for LLM call
        const taskHistory = prepareForLLM(activeTask.messages);

        return {
            taskHistory,
            taskID: activeTask._id,
        };

    } catch (error) {
        throw reportError("getTaskHistory", error, {userMessage: "❌ Database error"});
    }
}

// Update task history
export async function updateTaskHistory(message, taskID, taskStatus, timestamp = new Date()) {
    // Prepare message for storage
    const newMessages = prepareForStorage(message, timestamp);

    try {
        // Fields to be updated
        const updateTask = {
            $push: {messages: {$each: newMessages}},
            $set: {
                updated: timestamp,
                ...(taskStatus && {status: taskStatus}), // If status exists, update too
            },
        };

        // Update task
        await tasks.updateOne({_id: taskID}, updateTask);

    } catch (error) {
        throw reportError("updateTaskHistory", error, {
            context: {taskID, message},
            userMessage: "❌ Database error",
        });
    }
}