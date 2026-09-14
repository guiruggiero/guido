// Imports
import {Type} from "@google/genai";
import {createExpense} from "../utils/guiddleware.js";

// Tool definition
export const definition = {
    name: "addToSettleUp",
    description: "Adds an expense to Settle Up, optionally split with Georgia",
    parameters: {
        type: Type.OBJECT,
        properties: {
            title: {
                type: Type.STRING,
                description: "Short expense title, max 5 words",
            },
            amount: {
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
            otherPeople: {
                type: Type.ARRAY,
                items: {type: Type.STRING},
                description: "Names of anyone involved besides Gui and Georgia (e.g., [\"panda\"]). If present, the expense is always logged solely for Gui (Settle Up can't split with anyone else) with these names noted in the details, even if Georgia is also involved — splitEqually/guiOwes/georgiaOwes/paidBy are ignored in that case.",
            },
            splitEqually: {
                type: Type.BOOLEAN,
                description: "True to split the expense 50/50 with Georgia. Omit or false to log for yourself only. Only applies when otherPeople is not given.",
            },
            guiOwes: {
                type: Type.NUMBER,
                description: "Only for an uneven split: exact amount Gui owes. Must be given together with georgiaOwes, summing to amount. Do not combine with splitEqually. Only applies when otherPeople is not given.",
            },
            georgiaOwes: {
                type: Type.NUMBER,
                description: "Only for an uneven split: exact amount Georgia owes. Must be given together with guiOwes, summing to amount. Do not combine with splitEqually. Only applies when otherPeople is not given.",
            },
            paidBy: {
                type: Type.STRING,
                description: "Lowercase name of who paid: \"gui\" or \"georgia\". Only relevant for a split expense. Defaults to \"gui\" if omitted.",
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

const capitalize = (name) => name.charAt(0).toUpperCase() + name.slice(1);

const getSplit = (args) => {
    if (args.guiOwes !== undefined || args.georgiaOwes !== undefined) return {gui: args.guiOwes, georgia: args.georgiaOwes};
    if (args.splitEqually) return "equal";
    return undefined;
};

// Tool handler — validation lives in Guiddleware; formats a WhatsApp-friendly reply
export const handler = async (args) => {
    const formattedAmount = formatAmount(args.amount, args.currency);

    // Anyone beyond Gui/Georgia forces a solo entry
    const hasOtherPeople = args.otherPeople?.length > 0;
    const split = hasOtherPeople ? undefined : getSplit(args);

    const fullDetails = hasOtherPeople ?
        [args.details, `Also involved: ${args.otherPeople.map(capitalize).join(", ")}`]
            .filter(Boolean).join("\n\n") :
        args.details;

    const {expense} = await createExpense({
        description: args.title,
        amount: args.amount,
        currency: args.currency,
        details: fullDetails,
        date: args.date,
        split,
        paidBy: hasOtherPeople ? undefined : args.paidBy,
        source: "GuiDo",
    });

    return {
        success: true,
        title: args.title,
        amount: formattedAmount,
        note: hasOtherPeople ?
            `Also involved: ${args.otherPeople.map(capitalize).join(", ")}` :
            undefined,
        expenseId: expense?.id,
    };
};
