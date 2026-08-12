// Imports
import {Type} from "@google/genai";
import {runPrompt} from "../utils/claudeCode.js";

// Tool definition
export const definition = {
    name: "askClaudeCode",
    description: "Forwards a coding task or question to Claude Code, which has read/write access to all of Gui's project repos on code-server. Use for development requests or questions about code — not for general questions.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            prompt: {
                type: Type.STRING,
                description: "The coding task or question to forward, as a self-contained instruction (Claude Code has no memory of this WhatsApp conversation)",
            },
        },
        required: ["prompt"],
    },
};

// Tool handler
export const handler = async (args) => {
    const {result} = await runPrompt(args.prompt);
    if (!result) throw new Error("Claude Code returned an empty result");

    return {
        success: true,
        result,
    };
};