// Imports
import {LangfuseClient} from "@langfuse/client";
import * as Sentry from "@sentry/node";

// Initialize Langfuse client
const langfuse = new LangfuseClient({
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    baseUrl: process.env.LANGFUSE_BASE_URL,
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
    
// Fetch the production version of a prompt by name
export const fetchPrompt = async (name) => {
    const res = await langfuse.prompt.get(name);
    return {prompt: res.prompt, version: res.version};
};

// Create a new prompt version without setting it as production
export const createPromptVersion = async (name, content) => {
    const res = await langfuse.prompt.create({
        name,
        type: "text",
        prompt: content,
        labels: [],
    });
    return res.version;
};

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