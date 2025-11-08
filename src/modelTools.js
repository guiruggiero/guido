// Imports
import {Type} from "@google/genai";
import axios from "axios";
import axiosRetry from "axios-retry";
import * as Sentry from "@sentry/node";

// Model tools
export function getTools() {
    const createCalendarEvent = {
        name: "create_calendar_event",
        description: "Creates a calendar event with title and time, location, and description",
        parameters: {
            type: Type.OBJECT,
            properties: {
                title: {
                    type: Type.STRING,
                    description: "Event title/name, max 7 words",
                },
                start: {
                    type: Type.STRING,
                    description: "Event start date and time in ISO-8601 format (YYYY-MM-DDTHH:MM:SS)",
                },
                end: {
                    type: Type.STRING,
                    description: "Event end date and time in ISO-8601 format (YYYY-MM-DDTHH:MM:SS)",
                },
                timeZone: {
                    type: Type.STRING,
                    description: "Event time zone in IANA identifier (e.g., 'America/Los_Angeles')",
                },
                location: {
                    type: Type.STRING,
                    description: "Event location, be it physical or virtual (link)",
                },
                description: {
                    type: Type.STRING,
                    description: "Additional details of the event",
                },
            },
            required: ["title", "start", "end", "timeZone"],
        },
    };

    const summarize = {
        name: "summarize",
        description: "Creates a concise summary of the message in a single paragraph",
        parameters: {
            type: Type.OBJECT,
            properties: {
                // type: { // TODO
                //     type: Type.STRING,
                //     enum: ["text", "audio", "image", "file"],
                //     description: "Message type to be summarized",
                // },
                summary: {
                    type: Type.STRING,
                    description: "A concise paragraph summarizing the key points or action items from messages",
                },
            },
            required: ["summary"],
        },
    };

    const addToSplitwise = {
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

    const completeTask = { // TODO: add to prompt
        name: "complete_task",
        description: "Completes the task at hand by updating its status in the database",
        parameters: {
            type: Type.OBJECT,
            properties: {
                taskStatus: {
                    type: Type.STRING,
                    enum: ["success"],
                    description: "Pass 'success' status to clomplete task (with Gui's confirmation)",
                },
            },
            required: ["taskStatus"],
        },
    };

    return [
        createCalendarEvent,
        summarize,
        addToSplitwise,
        completeTask,
    ];
}

// Axios instance for Splitwise
const axiosInstance = axios.create({
    baseURL: "https://secure.splitwise.com/api/v3.0",
    headers: {"Authorization": `Bearer ${process.env.SPLITWISE_API_KEY}`},
});

// Retry configuration
axiosRetry(axiosInstance, {
    retries: 2, // Retry attempts
    retryDelay: axiosRetry.exponentialDelay, // 1s then 2s between retries
    // Only retry on network or 5xx errors
    retryCondition: (error) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
      (error.response && error.response.status >= 500);
    },
});

// Splitwise error checker
const checkSplitwiseError = (expenseData) => {
    const {error, errors} = expenseData;

    if (error) throw new Error(`Splitwise API: ${error}`); // {error: ""}

    if (errors && Object.keys(errors).length > 0) { // {errors: {base: [""]}}
        const errorMessage = Object.values(errors).flat().join(", ");
        throw new Error(`Splitwise API: ${errorMessage}`);
    }
};

// Tool handlers
const toolHandlers = {
    create_calendar_event: async (args) => {
        // TODO: Google Calendar API call

        return {
            success: true,
            title: args.title,
            start: args.start,
            timeZone: args.timeZone,
            link: "https://calendar.google.com", // calendarEvent.link
        };
    },

    summarize: (args) => {
        return {
            success: true,
            summary: args.summary,
        };
    },

    add_to_splitwise: async (args) => {
        // Add expense on Splitwise
        const expenseResponse = await axiosInstance.post("/create_expense", {
            cost: args.amount.toFixed(2),
            description: args.title,
            details: args.details + "\n\nCreated with GuiDo",
            currency_code: args.currency,
            group_id: 0, // Direct expense between users
            split_equally: true,
        });
        checkSplitwiseError(expenseResponse.data);

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
    },

    complete_task: (args) => {
        return {
            success: true,
            taskStatus: args.taskStatus,
        };
    },
};

// Tool handlers
export async function handleTool(toolCall) {
    const handler = toolHandlers[toolCall.name];

    try {
        // TODO: instead of logging? https://docs.sentry.io/platforms/javascript/enriching-events/breadcrumbs/
        // Sentry.addBreadcrumb({
        //     category: "tool-call",
        //     message: `Tool call: ${toolCall.name}`,
        //     data: toolCall.args,
        //     level: "info",
        // });

        return await handler(toolCall.args);

    } catch (error) {
        Sentry.withScope((scope) => {
            scope.setTag("operation", "handleTool");
            scope.setContext("payload", {
                toolName: toolCall.name,
                toolCall: toolCall.args,
            });
            Sentry.captureException(error);
        });

        return `Error calling tool ${toolCall.name}`;
    }
}