// Imports
import {Type} from "@google/genai";
import {createExpense} from "../utils/guiddleware.js";

// Tool definition
export const definition = {
    name: "addToSplitwise",
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
                description: "Any remaining context about the expense not captured by other fields",
            },
            date: {
                type: Type.STRING,
                description: "ISO date/time the expense actually took place, only if mentioned or clearly implied (e.g., a receipt date). Omit to use the current time.",
            },
            splitWith: {
                type: Type.ARRAY,
                items: {type: Type.STRING},
                description: "Lowercase names of friends to split with (e.g., [\"georgia\", \"panda\"]). Omit to log for yourself only.",
            },
            paidBy: {
                type: Type.STRING,
                description: "Lowercase name of who paid (e.g., \"georgia\"). Defaults to \"gui\" if omitted.",
            },
            owedAmounts: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: {
                            type: Type.STRING,
                            description: "Lowercase participant name, including \"gui\" if they owe part of the expense",
                        },
                        owed: {
                            type: Type.NUMBER,
                            description: "Amount this person is responsible for",
                        },
                    },
                    required: ["name", "owed"],
                },
                description: "Only for uneven splits, where people owe different specified amounts (still a single payer, from paidBy). Amounts must sum to the total amount. Omit entirely for a simple equal split — do not use together with splitWith.",
            },
        },
        required: ["title", "amount", "currency", "details"],
    },
};

// Format amount for display, falling back to plain string for codes
const formatAmount = (amount, currency) => {
    try {
        return new Intl.NumberFormat("en-US", {style: "currency", currency}).format(amount);
    } catch {
        return `${amount.toFixed(2)} ${currency}`;
    }
};

// Tool handler — resolution, fallback logic, and expense creation all live
// in Guiddleware; this just formats a WhatsApp-friendly reply from the result
export const handler = async (args) => {
    const formattedAmount = formatAmount(args.amount, args.currency);

    const {expense, fallback, issues, unknownNames} = await createExpense({
        description: args.title,
        amount: args.amount,
        currency: args.currency,
        details: args.details,
        date: args.date,
        splitWith: args.splitWith,
        paidBy: args.paidBy,
        owedAmounts: args.owedAmounts,
        source: "GuiDo",
    });

    if (fallback === "solo") {
        const reason = issues?.join("; ").toLowerCase() ??
            `couldn't find: ${unknownNames?.join(", ")}`;
        return {
            success: true,
            title: args.title,
            amount: formattedAmount,
            note: `Added solo (${reason}) — open Splitwise to fix this one`,
            link: "https://secure.splitwise.com/#/activity",
        };
    }

    return {
        success: true,
        title: args.title,
        amount: formattedAmount,
        link: "https://secure.splitwise.com/#/activity",
        expenseId: expense?.id,
    };
};