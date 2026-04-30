// Import
import {Type} from "@google/genai";

export const definition = {
    name: "completeTask", // TODO: add to prompt
    description: "Completes the task at hand by updating its status in the database",
    parameters: {
        type: Type.OBJECT,
        properties: {
            taskStatus: {
                type: Type.STRING,
                enum: ["success"],
                description: "Pass 'success' status to complete task (with Gui's confirmation)",
            },
        },
        required: ["taskStatus"],
    },
};

export const handler = (args) => {
    return {
        success: true,
        taskStatus: args.taskStatus,
    };
};
