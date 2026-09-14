// Imports
import {Type} from "@google/genai";
import {getFlightAwareUrl} from "../utils/guiddleware.js";

// Tool definition
export const definition = {
    name: "trackFlight",
    description: "Gets a FlightAware live-tracking link for a flight",
    parameters: {
        type: Type.OBJECT,
        properties: {
            flightNumber: {
                type: Type.STRING,
                description: "IATA flight number (e.g., \"UA123\")",
            },
        },
        required: ["flightNumber"],
    },
};

// Tool handler
export const handler = async (args) => {
    const url = await getFlightAwareUrl(args.flightNumber);
    if (!url) {
        return {
            success: false,
            note: `Couldn't find flight ${args.flightNumber} on FlightAware`,
        };
    }

    return {
        success: true,
        flightNumber: args.flightNumber,
        link: url,
    };
};