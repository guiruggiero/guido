// Imports
import {Type} from "@google/genai";
import {lockDoor as lockFrontDoor} from "../utils/homeAssistant.js";

// Tool definition
export const definition = {
    name: "lockDoor",
    description: "Locks the front door",
    parameters: {
        type: Type.OBJECT,
        properties: {},
    },
};

// Tool handler
export const handler = async () => {
    await lockFrontDoor();
    return {
        success: true,
    };
};
