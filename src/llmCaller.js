// Imports
import {GoogleGenAI, FunctionCallingConfigMode} from "@google/genai";
import {getTools, handleTool} from "./modelTools.js";
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
            // {googleSearch: {}},
            // {urlContext: {}},
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
        else { // Media message
            llmMessage = [
                // {text: "Summarize this audio/document, caption this image"}, // TODO: needed?
                {inlineData: {
                    mimeType: `${message.type}/${message.extension}`,
                    data: message.content, // Base64 data
                }},
            ];
        }

        // Call LLM
        const response = await chat.sendMessage({message: llmMessage});

        // No tool calls
        if (!response?.functionCalls || response.functionCalls.length === 0) return response.candidates[0].content.parts[0].text;

        else {
            // Only one tool call
            const toolResponse = [{
                functionResponse: {
                    name: response.functionCalls[0].name,
                    response: await handleTool(response.functionCalls[0]),
                },
            }];

            // TODO: compositional tool calls - for each, execute and gather results https://ai.google.dev/gemini-api/docs/function-calling?example=weather#compositional_function_calling
            // const toolResponses = await Promise.all(response.functionCalls.map(async (toolCall) => {
            //     return {functionResponse: {
            //         name: toolCall.name,
            //         response: await handleTool(toolCall),
            //     }};
            // }));

            // Send results to model
            const finalResponse = await chat.sendMessage({message: toolResponse});

            message.status = "completed";

            return finalResponse.candidates[0].content.parts[0].text;
        }

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

        // Rethrow to show user a message
        error.userMessage = "❌ LLM call error";
        throw error;
    }
}