// Imports
import {Type} from "@google/genai";
import {unlockDoor as unlockFrontDoor} from "../utils/homeAssistant.js";

// Tool definition
export const definition = {
    name: "unlockDoor",
    description: "Unlocks the front door",
    parameters: {
        type: Type.OBJECT,
        properties: {},
    },
};

// Tool handler
export const handler = async () => {
    await unlockFrontDoor();
    return {
        success: true,
    };
};
