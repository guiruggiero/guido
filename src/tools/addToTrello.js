// Imports
import {Type} from "@google/genai";
import {createTrelloCard} from "../utils/guiddleware.js";

// Tool definition
export const definition = {
    name: "addToTrello",
    description: "Creates a Trello card. Use only when Gui explicitly says \"card\" or \"Trello\" — use addReminder otherwise.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            name: {
                type: Type.STRING,
                description: "Short card title, max 7 words",
            },
            description: {
                type: Type.STRING,
                description: "Any remaining context about the card not captured by the title",
            },
            list: {
                type: Type.STRING,
                enum: ["todo", "inbox", "prioritized", "doing", "waiting", "habits", "done"],
                description: "List to create the card in. Omit to use the default inbox list.",
            },
        },
        required: ["name"],
    },
};

// Tool handler
export const handler = async (args) => {
    const card = await createTrelloCard({list: args.list, name: args.name, description: args.description});

    return {
        success: true,
        name: args.name,
        link: card.url,
        cardId: card.id,
    };
};