// Import
import {Type} from "@google/genai";

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
        },
        required: ["title", "start", "end", "timeZone"],
    },
};

export const handler = async (args) => {
    // TODO: Google Calendar API call

    return {
        success: true,
        title: args.title,
        start: args.start,
        timeZone: args.timeZone,
        link: "https://calendar.google.com", // calendarEvent.link
    };
};
