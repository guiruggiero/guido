// Imports
import {createRetryClient} from "./axiosClient.js";

// Axios instance for Guiddleware
const guiddlewareClient = createRetryClient({
    baseURL: process.env.GUIDDLEWARE_URL,
    timeout: 10000, // 10s
    headers: {
        "Authorization": `Bearer ${process.env.GUIDDLEWARE_SECRET_GUIDO}`,
        "Content-Type": "application/json",
    },
});

// Creates a Google Task
export const createTask = async (payload) => {
    const res = await guiddlewareClient.post("/tasks", payload);
    return res.data;
};

// Creates a Splitwise expense; resolution/fallback logic lives in Guiddleware
export const createExpense = async (payload) => {
    const res = await guiddlewareClient.post("/splitwise/expenses", payload);
    return res.data;
};

// Creates a Google Calendar event
export const createCalendarEvent = async (payload) => {
    const res = await guiddlewareClient.post("/calendar/events", payload);
    return res.data;
};
