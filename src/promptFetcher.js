// Imports
import {LangfuseClient} from "@langfuse/client";
import * as Sentry from "@sentry/node";
import {reportError} from "./utils/reportError.js";

// Initialize Langfuse client
const langfuse = new LangfuseClient({
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    baseUrl: process.env.LANGFUSE_BASE_URL,
});

// Different prompts according to environment
const label = process.env.ENV === "dev" ? "latest" : "production";

// Placeholder values to validate prompt compilation at startup
const startupVariables = () => {
    const now = new Date();
    return {
        today: now.toLocaleDateString("en-US", {day: "numeric", month: "long", year: "numeric", timeZone: "America/Los_Angeles"}),
        time: now.toLocaleTimeString("en-US", {hour: "2-digit", minute: "2-digit", timeZone: "America/Los_Angeles"}),
    };
};

// Fetch and compile all prompts on startup to warm the cache or fail fast
const PROMPTS = ["GuiDo", "Guindex"];
for (const name of PROMPTS) {
    try {
        const compiled = await loadPrompt(name, startupVariables());

        // Catch variables the app never provides before they reach a system instruction
        const uncompiled = compiled.match(/{{\s*\w+\s*}}/g);
        if (uncompiled) {
            throw new Error(`Uncompiled variables: ${[...new Set(uncompiled)].join(", ")}`);
        }

        console.log(`${name} prompt downloaded and compiled`);
        Sentry.logger.info(`${name} prompt downloaded and compiled`);

    } catch (error) {
        console.error(`Failed to load ${name} prompt`);
        Sentry.logger.error(`Failed to load ${name} prompt`, {error: error.message});

        // Rethrow to stop execution and not run on a broken prompt
        throw error;
    }
}

// Fetches raw prompt (for promptSync)
export const fetchPrompt = async (name) => {
    const res = await langfuse.prompt.get(name);
    return {prompt: res.prompt, version: res.version};
};

// Creates a new draft without publishing it
export const createPromptVersion = async (name, content) => {
    const res = await langfuse.prompt.create({
        name,
        type: "text",
        prompt: content,
        labels: [],
    });
    return res.version;
};

// Fetches a prompt with cache and compiles variables
async function loadPrompt(name, variables) {
    const response = await langfuse.prompt.get(name, {
        cacheTtlSeconds: 180, // 3m cache
        label,
    });

    // Replace variables
    try {
        return response.compile(variables);

    } catch (error) {
        // Rethrow instead of falling back to the uncompiled prompt with raw {{variable}} syntax
        throw reportError(`loadPrompt:${name}`, error, {
            context: {name, label, promptVersion: response.version, variables},
            userMessage: "❌ Prompt error",
        });
    }
}

export const getGuiDoPrompt = (variables = {}) => loadPrompt("GuiDo", variables);
export const getGuindexPrompt = (variables = {}) => loadPrompt("Guindex", variables);