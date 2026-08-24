// Imports
import {GoogleGenAI, FunctionCallingConfigMode} from "@google/genai";
import {getGuindexPrompt} from "./promptFetcher.js";
import {sendMessage} from "./messageHandler.js";
import {reportError} from "./utils/reportError.js";
import * as Sentry from "@sentry/node";
import {
    definition as addReminderDef,
    handler as addReminderHandler,
} from "./tools/addReminder.js";
import {
    definition as addToCalendarDef,
    handler as addToCalendarHandler,
} from "./tools/addToCalendar.js";
import {
    definition as addToSplitwiseDef,
    handler as addToSplitwiseHandler,
} from "./tools/addToSplitwise.js";
import {
    definition as addToTrelloDef,
    handler as addToTrelloHandler,
} from "./tools/addToTrello.js";
import {
    definition as trackFlightDef,
    handler as trackFlightHandler,
} from "./tools/trackFlight.js";
import {
    definition as lockDoorDef,
    handler as lockDoorHandler,
} from "./tools/lockDoor.js";

// Initialize Gemini client
const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});

// Tool registry
const guindexFunctionDeclarations = [
    addReminderDef,
    addToCalendarDef,
    addToSplitwiseDef,
    addToTrelloDef,
    trackFlightDef,
    lockDoorDef,
];
const guindexToolHandlers = {
    [addReminderDef.name]: addReminderHandler,
    [addToCalendarDef.name]: addToCalendarHandler,
    [addToSplitwiseDef.name]: addToSplitwiseHandler,
    [addToTrelloDef.name]: addToTrelloHandler,
    [trackFlightDef.name]: trackFlightHandler,
    [lockDoorDef.name]: lockDoorHandler,
};

// Builds a human-friendly confirmation from the tool result
function formatConfirmation(toolName, result) {
    switch (toolName) {
        case addReminderDef.name:
            return `✅ Reminder: "${result.title}"`;
        case addToCalendarDef.name:
            return `✅ Event: "${result.title}" (${result.start})`;
        case addToSplitwiseDef.name: {
            const base = `✅ Expense: ${result.title} (${result.amount})`;
            return result.note ? `${base}\n⚠️ ${result.note}` : base;
        }
        case addToTrelloDef.name:
            return `✅ Trello card: "${result.name}"`;
        case trackFlightDef.name:
            return result.success ?
                `✅ Flight ${result.flightNumber}: ${result.link}` :
                `⚠️ ${result.note}`;
        case lockDoorDef.name:
            return "✅ Front door locked";
        default:
            return `✅ Done: ${toolName}`;
    }
}

// Processes a Index 01 transcription
export async function handleGuindex(transcription, recordedAt) {
    try {
        // Parse recordedAt (ms since epoch), fall back to now
        const epochMs = Number(recordedAt);
        const timestamp = Number.isFinite(epochMs) && epochMs > 0 ? new Date(epochMs) : new Date();
        const today = timestamp.toLocaleDateString("en-US", {day: "numeric", month: "long", year: "numeric", timeZone: "America/Los_Angeles"});
        const time = timestamp.toLocaleTimeString("en-US", {hour: "2-digit", minute: "2-digit", timeZone: "America/Los_Angeles"});

        // Fetch system prompt
        const systemInstruction = await getGuindexPrompt({today, time});

        // Single-turn with forced tool-call
        const response = await ai.models.generateContent({
            model: "gemini-flash-latest",
            config: {
                systemInstruction,
                tools: [{functionDeclarations: guindexFunctionDeclarations}],
                toolConfig: {
                    functionCallingConfig: {mode: FunctionCallingConfigMode.ANY},
                },
            },
            contents: transcription,
        });

        const functionCalls = response.functionCalls;
        if (!functionCalls || functionCalls.length === 0) {
            Sentry.logger.warn("Guindex: no tool call in forced-tool response", {transcription});
            await sendMessage("⚠️ Guindex: couldn't determine action");
            return;
        }

        // Execute the first tool call (one action per press)
        const toolCall = functionCalls[0];
        const handler = guindexToolHandlers[toolCall.name];
        if (!handler) {
            Sentry.logger.warn("Guindex: unknown tool", {toolName: toolCall.name});
            await sendMessage(`⚠️ Guindex: unknown action "${toolCall.name}"`);
            return;
        }

        let toolResult;
        try {
            toolResult = await handler(toolCall.args);
        } catch (error) {
            reportError("guindex.executeToolCall", error, {
                context: {toolName: toolCall.name, toolArgs: toolCall.args, transcription},
            });
            await sendMessage(`❌ Guindex: ${error.userMessage ?? "action failed"}`);
            return;
        }

        // Confirm action via WhatsApp
        await sendMessage(formatConfirmation(toolCall.name, toolResult));

    } catch (error) {
        reportError("handleGuindex", error, {context: {transcription, recordedAt}});

        try {await sendMessage("❌ Guindex error");}
        catch {/* ignore, nothing more we can do */}
    }
}