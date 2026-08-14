// Imports
import {createRetryClient} from "./axiosClient.js";
import {reportError} from "./reportError.js";

// Axios instance for Guiddleware
const guiddlewareClient = createRetryClient({
    baseURL: process.env.GUIDDLEWARE_URL,
    timeout: 30000, // 30s, to absorb Guiddleware cold starts + API retries
    headers: {
        "Authorization": `Bearer ${process.env.GUIDDLEWARE_SECRET_GUIDO}`,
        "Content-Type": "application/json",
    },
});

// Creates a Google Task
export const createTask = async (payload) => {
    try {
        const res = await guiddlewareClient.post("/tasks", payload);
        return res.data;

    } catch (error) {
        throw reportError("guiddleware.createTask", error, {
            context: {payload, status: error.response?.status, responseBody: error.response?.data},
            userMessage: "❌ Task creation error",
        });
    }
};

// Creates a Splitwise expense; resolution/fallback logic lives in Guiddleware
export const createExpense = async (payload) => {
    const res = await guiddlewareClient.post("/splitwise/expenses", payload);
    return res.data;
};

// Creates a Google Calendar event
export const createCalendarEvent = async (payload) => {
    try {
        const res = await guiddlewareClient.post("/calendar/events", payload);
        return res.data;

    } catch (error) {
        throw reportError("guiddleware.createCalendarEvent", error, {
            context: {payload, status: error.response?.status, responseBody: error.response?.data},
            userMessage: "❌ Calendar event creation error",
        });
    }
};

// Gets a FlightAware live-tracking URL
export const getFlightAwareUrl = async (flightNumber) => {
    try {
        const res = await guiddlewareClient.get("/flightaware/track", {params: {flightNumber}});
        return res.data.url;

    } catch (error) {
        throw reportError("guiddleware.getFlightAwareUrl", error, {
            context: {flightNumber, status: error.response?.status, responseBody: error.response?.data},
            userMessage: "❌ Flight tracking error",
        });
    }
};

// Creates a Trello card
export const createTrelloCard = async (payload) => {
    try {
        const res = await guiddlewareClient.post("/trello/cards", payload);
        return res.data;

    } catch (error) {
        throw reportError("guiddleware.createTrelloCard", error, {
            context: {payload, status: error.response?.status, responseBody: error.response?.data},
            userMessage: "❌ Trello card creation error",
        });
    }
};

// Searches Trello card titles
export const searchTrelloCards = async (query, limit) => {
    try {
        const res = await guiddlewareClient.get("/trello/cards/search", {params: {q: query, limit}});
        return res.data.cards;

    } catch (error) {
        throw reportError("guiddleware.searchTrelloCards", error, {
            context: {query, limit, status: error.response?.status, responseBody: error.response?.data},
            userMessage: "❌ Trello search error",
        });
    }
};

// Updates a Trello card (rename, note, move)
export const updateTrelloCard = async (id, payload) => {
    try {
        const res = await guiddlewareClient.patch(`/trello/cards/${id}`, payload);
        return res.data;

    } catch (error) {
        throw reportError("guiddleware.updateTrelloCard", error, {
            context: {id, payload, status: error.response?.status, responseBody: error.response?.data},
            userMessage: "❌ Trello card update error",
        });
    }
};