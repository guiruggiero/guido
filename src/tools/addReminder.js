// Imports
import {Type} from "@google/genai";
import {createReminder} from "../utils/guiddleware.js";

// Tool definition
export const definition = {
    name: "addReminder",
    description: "Adds a to-do item to Google Tasks",
    parameters: {
        type: Type.OBJECT,
        properties: {
            title: {
                type: Type.STRING,
                description: "Short reminder title, max 7 words",
            },
            notes: {
                type: Type.STRING,
                description: "Any remaining context about the reminder not captured by the title",
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
    const reminder = await createReminder({title: args.title, notes, due: args.due});

    return {
        success: true,
        title: args.title,
        reminderId: reminder.id,
    };
};