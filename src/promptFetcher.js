// Imports
import {LangfuseClient} from "@langfuse/client";
import * as Sentry from "@sentry/node";

// Initialization
const langfuse = new LangfuseClient({
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    baseUrl: "https://us.cloud.langfuse.com",
});

// Different prompts according to environment
const label = process.env.ENV === "dev" ? "latest" : "production";

// Download on startup to cache as fallback
try {
    await langfuse.prompt.get("GuiDo", {label: label});
    console.log("Prompt downloaded");

} catch (error) {
    console.error("Failed to download prompt");

    // Rethrow to stop execution
    throw error;
}
    
// Get model prompt
export async function getPrompt(variables = {}) {
    const response = await langfuse.prompt.get("GuiDo", {
        cacheTtlSeconds: 180, // 3m cache
        label: label,
    });

    // Replace variables
    try {
        const compiledPrompt = response.compile(variables);

        return compiledPrompt;

    } catch (error) {
        Sentry.withScope((scope) => {
            scope.setTag("operation", "getPrompt");
            scope.setContext("payload", {
                label,
                promptVersion: response.version,
                variables,
            });
            Sentry.captureException(error);
        });
        
        return response.prompt;
    }
}