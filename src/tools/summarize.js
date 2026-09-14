// Import
import {Type} from "@google/genai";

// Tool definition
export const definition = {
    name: "summarize",
    description: "Creates a concise summary of the message in a single paragraph",
    parameters: {
        type: Type.OBJECT,
        properties: {
            summary: {
                type: Type.STRING,
                description: "A concise paragraph summarizing the key points or action items from messages",
            },
        },
        required: ["summary"],
    },
};

// Tool handler
export const handler = (args) => {
    return {
        success: true,
        summary: args.summary,
    };
};