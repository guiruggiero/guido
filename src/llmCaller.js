// Imports
import {GoogleGenAI, FunctionCallingConfigMode} from "@google/genai";
import {getTools, handleTool} from "./modelTools.js";
import {startActiveObservation, startObservation} from "@langfuse/tracing";
import {getPrompt} from "./promptFetcher.js";
import * as Sentry from "@sentry/node";

// Initialize Gemini client
const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});

// Model configuration
const modelConfig = {
    model: "gemini-flash-latest",
    config: {
        temperature: 0.4,
        thinkingconfig: {
            thinkingbudget: 0,
        },
        tools: [
            {functionDeclarations: getTools()},
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

// Call LLM
export async function callLLM(message) {
    return await startActiveObservation("llm-interaction", async (trace) => { // TODO: needs return?
        // Update trace with metadata
        trace.update({ // TODO: why divided into input and metadata?, review context
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
                    // {text: "Summarize this audio/document, caption this image"}, // TODO: needed?
                    {inlineData: {
                        mimeType: `${message.type}/${message.extension}`,
                        data: message.content, // Base64 data
                    }},
                ];
            }

            // Create generation observation for LLM call
            const generationObs = startObservation("llm-call",
                { // TODO: review context
                    model: modelConfig.model,
                    modelParameters: {temperature: modelConfig.config.temperature},
                    input: typeof llmMessage === "string" ? llmMessage : "[Media content]",
                },
                {asType: "generation"},
            );

            // Call LLM
            const response = await chat.sendMessage({message: llmMessage});

            // Update generation observation
            generationObs.update({ // TODO: review context
                output: response.candidates[0].content.parts[0].text,
                usage: response.usageMetadata ? {
                    input: response.usageMetadata.promptTokenCount,
                    output: response.usageMetadata.candidatesTokenCount,
                    total: response.usageMetadata.totalTokenCount,
                } : undefined,
            });
            generationObs.end();

            // No tool calls
            if (!response?.functionCalls || response.functionCalls.length === 0) {
                trace.update({output: response.candidates[0].content.parts[0].text}); // TODO: why trace and not generation?
                return {response: response.candidates[0].content.parts[0].text};
            }

            // Handle tool calls in sequence (compositional)
            let currentResponse = response;
            let taskStatus;
            while (currentResponse?.functionCalls && currentResponse.functionCalls.length > 0) {
                // Get the tool
                const toolCall = currentResponse.functionCalls[0];

                // Create tool observation
                const toolObs = startObservation(`tool-${toolCall.name}`, // TODO: review context
                    {input: toolCall.args},
                    {asType: "tool"},
                );
                
                // Execute the tool
                const toolResult = await handleTool(toolCall);
                if (toolResult.taskStatus) taskStatus = toolResult.taskStatus;
                const toolResponse = [{
                    functionResponse: {
                        name: toolCall.name,
                        response: toolResult,
                    },
                }];

                // Update tool observation
                toolObs.update({output: toolResult});
                toolObs.end();

                // Create observation for processing tool result
                const toolFollowUpObs = startObservation("llm-followup", // TODO: review context
                    {
                        model: modelConfig.model,
                        input: toolResponse,
                    },
                    {asType: "generation"},
                );

                // Send tool result to model
                currentResponse = await chat.sendMessage({message: toolResponse});

                // Update tool result processing observation
                toolFollowUpObs.update({ // TODO: review context
                    output: currentResponse.candidates[0].content.parts[0].text,
                    usage: currentResponse.usageMetadata ? {
                        input: currentResponse.usageMetadata.promptTokenCount,
                        output: currentResponse.usageMetadata.candidatesTokenCount,
                        total: currentResponse.usageMetadata.totalTokenCount,
                    } : undefined,
                });
                toolFollowUpObs.end();
            }

            // Update trace with final output
            trace.update({ // TODO: review context
                output: currentResponse.candidates[0].content.parts[0].text,
                metadata: {toolsUsed: taskStatus ? true : false},
            });
            // TODO: no trace.end();?

            // No more tool calls
            return {
                response: currentResponse.candidates[0].content.parts[0].text,
                taskStatus: taskStatus,
            };

        } catch (error) {
            Sentry.withScope((scope) => {
                scope.setTag("operation", "callLLM");
                scope.setContext("payload", {
                    taskHistory: message.taskHistory,
                    messageType: message.type,
                    messageID: message.id,
                });
                Sentry.captureException(error);
            });

            // Update trace with error
            trace.update({
                level: "ERROR",
                statusMessage: error.message,
            });

            // Rethrow to show user a message
            error.userMessage = "❌ LLM call error";
            throw error;
        }
    });
}