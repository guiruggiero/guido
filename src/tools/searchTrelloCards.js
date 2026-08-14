// Imports
import {Type} from "@google/genai";
import {searchTrelloCards} from "../utils/guiddleware.js";

// Tool definition
export const definition = {
    name: "searchTrelloCards",
    description: "Searches Trello card titles to find a card's ID before editing or moving it with editTrelloCard. Excludes the done list.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            query: {
                type: Type.STRING,
                description: "Search text to match against card titles (e.g., the task name Gui mentioned)",
            },
        },
        required: ["query"],
    },
};

// Tool handler
export const handler = async (args) => {
    const cards = await searchTrelloCards(args.query);

    return {
        success: true,
        query: args.query,
        matchCount: cards.length,
        cards: cards.map((card) => ({id: card.id, name: card.name, list: card.list, url: card.url})),
    };
};