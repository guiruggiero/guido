// Imports
import {Type} from "@google/genai";
import {createSoloExpense} from "../utils/splitwise.js";

export const definition = {
    name: "add_to_splitwise",
    description: "Adds an expense to Splitwise to be shared with other people",
    parameters: {
        type: Type.OBJECT,
        properties: {
            title: { // Splitwise `description`
                type: Type.STRING,
                description: "Short expense title, max 5 words",
            },
            amount: { // Splitwise `cost`
                type: Type.NUMBER,
                description: "Expense amount without currency sign (e.g., 127.43)",
            },
            currency: {
                type: Type.STRING,
                enum: ["USD", "EUR", "BRL"],
                description: "Expense currency",
            },
            details: {
                type: Type.STRING,
                description: "Summary of all other expense information, including the people involved (e.g., 'Shared with: Georgia, Panda, and Ma')",
            },
        },
        required: ["title", "amount", "currency", "details"],
    },
};

export const handler = async (args) => {
    await createSoloExpense(args.title, args.amount, args.currency, args.details);

    // Format balance for display
    const formattedBalance = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: args.currency,
    }).format(args.amount);

    return {
        success: true,
        title: args.title,
        amount: formattedBalance,
        link: "https://secure.splitwise.com/#/activity", // TODO: deep link
    };
};
