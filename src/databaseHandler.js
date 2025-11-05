// Imports
import {MongoClient, ServerApiVersion} from "mongodb";
import * as Sentry from "@sentry/node";

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
    if (!mongoConnection) {
        // Initialize MongoDB client
        const client = new MongoClient(process.env.MONGODB_URI, mongoOptions);

        // Connect and confirm successful connection
        await client.connect();
        await client.db("admin").command({ping: 1});

        mongoConnection = client;
    }

    // Get task collection
    tasks = mongoConnection.db(process.env.ENV).collection("tasks");

    console.log("Database connection established");

} catch (error) {
    console.error("Failed to established database connection");

    // Rethrow to stop execution
    throw error;
}

// Shut down database connection
export async function cleanupDatabase() {
    if (mongoConnection) {
        try {
            await mongoConnection.close();
            mongoConnection = null;
            console.log("\nDatabase connection shut down");

        } catch (error) {
            console.error("\nFailed to shut down database connection");

            // Rethrow to send correct exit code
            throw error;
        }
    }
}

// Graceful database shutdown
process.on("SIGINT", async () => { // TODO: "failed to wait for command termination: exit status 130"
    try {
        await cleanupDatabase();
        process.exit(0);

    } catch {
        process.exit(1);
    }
});

// Prepare task history for LLM call
function prepareForLLM(taskHistory) {
    return taskHistory.map(msg => ({
        role: msg.role,
        parts: [{text: msg.content}],
    }));
}

// Prepare messages to be stored
function prepareForStorage(message, timestamp) {
    const userMessage = {
        whatsapp_id: message.id,
        timestamp: message.timestamp,
        type: message.type,
        role: "user",
        content: message.content, // TODO: what if media? Don't want to store base64 string
    };

    const modelMessage = {
        timestamp: timestamp,
        role: "model",
        content: message.response,
    };

    return [userMessage, modelMessage];
}

// Get task history or start new task
export async function getTaskHistory(timestamp) {
    try {
        // Check for task in progress
        const activeTask = await tasks.findOne(
            {status: "in_progress"},
            {projection: { // Restrict fields to be returned
                messages: 1,
                _id: 1,
            }},
        );

        // An active task exists
        if (activeTask) {
            // Prepare task history for LLM call
            const taskHistory = prepareForLLM(activeTask.messages);

            return {
                taskHistory,
                taskID: activeTask._id,
            };
        
        // No active task, create a new one
        } else {
            // Create a new task
            const newTask = await tasks.insertOne({
                started: timestamp,
                updated: timestamp,
                status: "in_progress",
                messages: [],
            });

            // Return empty task history and new ID
            return {
                taskHistory: [],
                taskID: newTask.insertedId,
            };
        }
    
    } catch (error) {
        Sentry.withScope((scope) => {
            scope.setTag("operation", "getTaskHistory");
            Sentry.captureException(error);
        });

        // Rethrow to show user a message
        error.userMessage = "❌ Database error";
        throw error;
    }
}

// Update task history
export async function updateTaskHistory(message, taskID, timestamp = new Date()) {
    // Prepare message for storage
    const newMessages = prepareForStorage(message, timestamp);

    try {
        // Fields to be updated
        const updateTask = {
            $push: {messages: {$each: newMessages}},
            $set: {
                updated: timestamp,
                ...(message.status && {status: message.status}), // If status exists, update too
            },
        };

        // Update task
        await tasks.updateOne({_id: taskID}, updateTask);

    } catch (error) {
        Sentry.withScope((scope) => {
            scope.setTag("operation", "updateTaskHistory");
            scope.setContext("payload", {
                taskID,
                message,
            });
            Sentry.captureException(error);
        });

        // Rethrow to show user a message
        error.userMessage = "❌ Database error";
        throw error;
    }
}