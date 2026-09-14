// Imports
import {Type} from "@google/genai";
import {getLockState} from "../utils/homeAssistant.js";

// Tool definition
export const definition = {
    name: "getLockStatus",
    description: "Gets the current status of the front door lock",
    parameters: {
        type: Type.OBJECT,
        properties: {},
    },
};

// Tool handler
export const handler = async () => {
    const state = await getLockState();
    return {
        success: true,
        state,
    };
};
