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

        // Call LLM
        const response = await chat.sendMessage({message: llmMessage});

        // No tool calls
        if (!response?.functionCalls || response.functionCalls.length === 0) return {response: response.candidates[0].content.parts[0].text};

        // Handle tool calls in sequence (compositional)
        let currentResponse = response;
        let taskStatus;
        while (currentResponse?.functionCalls && currentResponse.functionCalls.length > 0) {
            // Get the tool
            const toolCall = currentResponse.functionCalls[0];
            
            // console.log(`Executing tool: ${toolCall.name}`);
            
            // Execute the tool
            const toolResult = await handleTool(toolCall);
            if (toolResult.taskStatus) taskStatus = toolResult.taskStatus;

            const toolResponse = [{
                functionResponse: {
                    name: toolCall.name,
                    response: toolResult,
                },
            }];

            // console.log("Tool response:", JSON.stringify(toolResponse, null, 2));

            // Send tool result to model
            currentResponse = await chat.sendMessage({message: toolResponse});
        }

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

        // Rethrow to show user a message
        error.userMessage = "❌ LLM call error";
        throw error;
    }
}