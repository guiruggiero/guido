// Imports
import {Type} from "@google/genai";
import {updateTrelloCard} from "../utils/guiddleware.js";

// Tool definition
export const definition = {
    name: "editTrelloCard",
    description: "Renames, adds a note to, or moves an existing Trello card. Requires the card's ID — call searchTrelloCards first to find it.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            cardId: {
                type: Type.STRING,
                description: "ID of the card to update, from a prior searchTrelloCards call",
            },
            name: {
                type: Type.STRING,
                description: "New title for the card. Omit if not renaming.",
            },
            note: {
                type: Type.STRING,
                description: "Text to prepend as a note on the card's description. Omit if not adding a note.",
            },
            list: {
                type: Type.STRING,
                enum: ["todo", "inbox", "prioritized", "doing", "waiting", "habits", "done"],
                description: "List to move the card to, by name. Omit if not moving to a specific list. Mutually exclusive with direction.",
            },
            direction: {
                type: Type.STRING,
                enum: ["left", "right"],
                description: "Move the card one list left or right along the board's fixed list order. Mutually exclusive with list.",
            },
        },
        required: ["cardId"],
    },
};

// Tool handler
export const handler = async (args) => {
    const card = await updateTrelloCard(args.cardId, {
        name: args.name, note: args.note, list: args.list, direction: args.direction,
    });

    const changes = [];
    if (args.name !== undefined) changes.push("renamed");
    if (args.note !== undefined) changes.push("note added");
    if (args.list !== undefined) changes.push(`moved to ${args.list}`);
    if (args.direction !== undefined) changes.push(`moved ${args.direction}`);

    return {
        success: true,
        name: card.name,
        changes,
        link: card.url,
        cardId: card.id,
    };
};