// Imports
import {Type} from "@google/genai";
import {createTask} from "../utils/guiddleware.js";

// Tool definition
export const definition = {
    name: "addToTasks",
    description: "Adds a to-do item to Google Tasks",
    parameters: {
        type: Type.OBJECT,
        properties: {
            title: {
                type: Type.STRING,
                description: "Short task title, max 7 words",
            },
            notes: {
                type: Type.STRING,
                description: "Any remaining context about the task not captured by the title",
            },
            due: {
                type: Type.STRING,
                description: "Due date (YYYY-MM-DD), only if mentioned or clearly implied. Google Tasks only supports a date, not a time of day.",
            },
        },
        required: ["title"],
    },
};

// Tool handler
export const handler = async (args) => {
    const notes = [args.notes, "Created with GuiDo"].filter(Boolean).join("\n\n");
    const task = await createTask({title: args.title, notes, due: args.due});

    return {
        success: true,
        title: args.title,
        taskId: task.id,
    };
};