// Imports
import {MongoClient, ServerApiVersion} from "mongodb";
import * as Sentry from "@sentry/node";

// Initialize collections
let mongoConnection = null;
let chats = null;

// Initialize database connection
export async function initializeDatabase() {
    // Connection configuration with Stable API version
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

    try {
        // Initialize connection pool
        if (!mongoConnection) {
            const client = new MongoClient(process.env.MONGODB_URI, mongoOptions);

            // Send a ping to confirm successful connection
            await client.connect();
            await client.db("admin").command({ping: 1});

            mongoConnection = client;
        }

        // Get collections
        const dbName = process.env.ENV;
        chats = mongoConnection.db(dbName).collection("chats");

        console.log("Database connection established");

    } catch (error) {
        console.error("Failed to established database connection");

        // Rethrow to stop execution
        throw error;
    }
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