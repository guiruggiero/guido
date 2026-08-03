// Import
import {Type} from "@google/genai";
import {createCalendarEvent} from "../utils/guiddleware.js";

// Tool definition
export const definition = {
    name: "createCalendarEvent",
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
            calendar: {
                type: Type.STRING,
                enum: ["default", "shared"],
                description: "Calendar to add the event to: 'default' for Gui's personal calendar, 'shared' for the calendar shared with Georgia. Defaults to 'default' if not mentioned.",
            },
            reminders: {
                type: Type.ARRAY,
                description: "Custom reminders, only if explicitly requested (e.g. 'remind me 1 day before'). Omit to use the calendar's default reminders.",
                items: {
                    type: Type.OBJECT,
                    properties: {
                        method: {
                            type: Type.STRING,
                            enum: ["email", "popup"],
                            description: "How to be reminded",
                        },
                        minutes: {
                            type: Type.NUMBER,
                            description: "Minutes before the event start to send the reminder",
                        },
                    },
                    required: ["method", "minutes"],
                },
            },
            isSpecialProject: {
                type: Type.BOOLEAN,
                description: "Set to true only if Gui explicitly calls this out as a special project (colors the event distinctly on the calendar). Defaults to false.",
            },
        },
        required: ["title", "start", "end", "timeZone"],
    },
};

// Tool handler
export const handler = async (args) => {
    const result = await createCalendarEvent({
        summary: args.title,
        start: args.start,
        end: args.end,
        timeZone: args.timeZone,
        location: args.location,
        description: args.description,
        calendar: args.calendar,
        reminders: args.reminders,
        isSpecialProject: args.isSpecialProject,
    });

    return {
        success: true,
        title: args.title,
        start: args.start,
        timeZone: args.timeZone,
        link: result.link,
    };
};
