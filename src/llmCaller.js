// Imports
import {GoogleGenAI, FunctionCallingConfigMode} from "@google/genai";
import {startActiveObservation, startObservation, propagateAttributes} from "@langfuse/tracing";
import {getPrompt} from "./promptFetcher.js";
import * as Sentry from "@sentry/node";
import {reportError} from "./utils/reportError.js";
import {
    definition as createCalendarEventDef,
    handler as createCalendarEventHandler,
} from "./tools/createCalendarEvent.js";
import {
    definition as summarizeDef,
    handler as summarizeHandler,
} from "./tools/summarize.js";
import {
    definition as addToSplitwiseDef,
    handler as addToSplitwiseHandler,
} from "./tools/addToSplitwise.js";
import {
    definition as addToTasksDef,
    handler as addToTasksHandler,
} from "./tools/addToTasks.js";
import {
    definition as completeTaskDef,
    handler as completeTaskHandler,
} from "./tools/completeTask.js";

// Initialize Gemini client
const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});

// Tool registry
const functionDeclarations = [
    createCalendarEventDef,
    summarizeDef,
    addToSplitwiseDef,
    addToTasksDef,
    completeTaskDef,
];

const toolHandlers = {
    [createCalendarEventDef.name]: createCalendarEventHandler,
    [summarizeDef.name]: summarizeHandler,
    [addToSplitwiseDef.name]: addToSplitwiseHandler,
    [addToTasksDef.name]: addToTasksHandler,
    [completeTaskDef.name]: completeTaskHandler,
};

// Model configuration
const modelConfig = {
    model: "gemini-flash-latest",
    config: {
        thinkingConfig: {
            thinkingLevel: "low", // Or "minimal" or "medium"?
        },
        tools: [
            {functionDeclarations},
            {googleSearch: {}},
            {urlContext: {}},
        ],
        toolConfig: {
            functionCallingConfig: {
                mode: FunctionCallingConfigMode.AUTO,
            },
        },
    },
};

// Executes one round of tool calls concurrently
async function executeToolCalls(toolCalls) {
    const toolResults = await Promise.all(toolCalls.map(async (toolCall) => {
        // Create tool observation
        const toolObs = startObservation(`tool-${toolCall.name}`,
            {input: toolCall.args},
            {asType: "tool"},
        );

        // Execute the tool
        const handler = toolHandlers[toolCall.name];
        if (!handler) throw new Error(`Unknown tool: ${toolCall.name}`);

        let toolResult;
        try {
            toolResult = await handler(toolCall.args);
        } catch (error) {
            reportError("handleTool", error, {
                context: {toolName: toolCall.name, toolCall: toolCall.args},
            });
            toolResult = `Error calling tool ${toolCall.name}: ${error.message}`;
        }

        // Update tool observation
        toolObs.update({output: toolResult});
        toolObs.end();

        return {toolCall, toolResult};
    }));

    let taskStatus;
    // toolResults preserves toolCalls order
    const toolResponse = toolResults.map(({toolCall, toolResult}) => {
        if (toolResult.taskStatus) taskStatus = toolResult.taskStatus;
        return {
            functionResponse: {
                name: toolCall.name,
                response: toolResult,
            },
        };
    });

    return {toolResponse, taskStatus};
}

// Runs the tool-call loop until it stops calling tools or iteration cap
async function runToolLoop(chat, initialResponse) {
    const MAX_TOOL_ITERATIONS = 10;
    let currentResponse = initialResponse;
    let taskStatus;
    let iterations = 0;

    while (currentResponse?.functionCalls && currentResponse.functionCalls.length > 0) {
        if (++iterations > MAX_TOOL_ITERATIONS) {
            Sentry.logger.warn("Tool loop iteration limit reached", {iterations});
            break;
        }

        // Run multiple calls concurrently, not sequentially
        const {toolResponse, taskStatus: newStatus} =
            await executeToolCalls(currentResponse.functionCalls);
        if (newStatus) taskStatus = newStatus;

        // Create observation for processing tool results
        const toolFollowUpObs = startObservation("llm-call-followup",
            {
                model: modelConfig.model,
                input: toolResponse,
            },
            {asType: "generation"},
        );

        // Send tool results to model
        try {
            currentResponse = await chat.sendMessage({message: toolResponse});

            // Update tool result processing observation
            toolFollowUpObs.update({
                output: currentResponse.candidates?.[0]?.content?.parts?.[0]?.text,
                usageDetails: currentResponse.usageMetadata ? {
                    input: currentResponse.usageMetadata.promptTokenCount,
                    output: currentResponse.usageMetadata.candidatesTokenCount,
                    total: currentResponse.usageMetadata.totalTokenCount,
                } : undefined,
            });
            toolFollowUpObs.end();

        } catch (error) {
            toolFollowUpObs.update({level: "ERROR", statusMessage: error.message});
            toolFollowUpObs.end();
            throw error;
        }
    }

    return {finalResponse: currentResponse, taskStatus};
}

// Call LLM
export async function callLLM(message) {
    return await propagateAttributes(
        {sessionId: String(message.taskID), traceName: "llm-interaction"},
        () => callLLMTraced(message),
    );
}

async function callLLMTraced(message) {
    return await startActiveObservation("llm-interaction", async (trace) => {
        // Update trace with metadata
        trace.update({
            input: {
                messageid: message.id,
                messageType: message.type,
            },
            metadata: {
                taskId: message.taskID,
                timestamp: message.timestamp.toISOString(),
            },
        });

        try {
            // Get model prompt
            const instructions = await getPrompt({ // Prompt variable
                today: (message.timestamp).toLocaleDateString("en-US", {day: "numeric", month: "long", year: "numeric", timeZone: "America/Los_Angeles"}),
                time: (message.timestamp).toLocaleTimeString("en-US", {hour: "2-digit", minute: "2-digit", timeZone: "America/Los_Angeles"}), // TODO: get time zone at runtime
            });

            // Initialize chat with task history and prompt
            const chat = ai.chats.create({
                ...modelConfig,
                config: {
                    ...modelConfig.config,
                    systemInstruction: instructions,
                },
                history: message.taskHistory,
            });

            // Construct message for LLM
            let llmMessage = null;
            if (message.type === "text") llmMessage = message.content;

            // Media message
            else {
                llmMessage = [
                    {inlineData: {
                        mimeType: `${message.type}/${message.extension}`,
                        data: message.content, // Base64 data
                    }},
                ];
            }

            // Create generation observation for LLM call
            const generationObs = startObservation("llm-call",
                {
                    model: modelConfig.model,
                    modelParameters: {thinkingLevel: modelConfig.config.thinkingConfig.thinkingLevel},
                    input: typeof llmMessage === "string" ? llmMessage : "[Media content]",
                },
                {asType: "generation"},
            );

            // Call LLM
            let response;
            try {
                response = await chat.sendMessage({message: llmMessage});

                // Update generation observation
                generationObs.update({
                    output: response.candidates?.[0]?.content?.parts?.[0]?.text,
                    usageDetails: response.usageMetadata ? {
                        input: response.usageMetadata.promptTokenCount,
                        output: response.usageMetadata.candidatesTokenCount,
                        total: response.usageMetadata.totalTokenCount,
                    } : undefined,
                });
                generationObs.end();

            } catch (error) {
                generationObs.update({level: "ERROR", statusMessage: error.message});
                generationObs.end();
                throw error;
            }

            // No tool calls
            if (!response?.functionCalls || response.functionCalls.length === 0) {
                trace.update({output: response.candidates?.[0]?.content?.parts?.[0]?.text});
                return {response: response.candidates?.[0]?.content?.parts?.[0]?.text ?? ""};
            }

            // Handle tool calls
            const {finalResponse: currentResponse, taskStatus} =
                await runToolLoop(chat, response);

            // Update trace with final output
            trace.update({
                output: currentResponse.candidates?.[0]?.content?.parts?.[0]?.text,
                metadata: {toolsUsed: !!taskStatus},
            });

            // No more tool calls
            return {
                response: currentResponse.candidates?.[0]?.content?.parts?.[0]?.text ?? "",
                taskStatus: taskStatus,
            };

        } catch (error) {
            // Preserve a more specific userMessage set upstream (e.g. by getPrompt) instead of overwriting it
            reportError("callLLM", error, {
                context: {
                    taskHistory: message.taskHistory,
                    messageType: message.type,
                    messageID: message.id,
                },
                userMessage: error.userMessage ?? "❌ LLM call error",
            });

            // Update trace with error
            trace.update({
                level: "ERROR",
                statusMessage: error.message,
            });

            throw error;
        }
    });
}