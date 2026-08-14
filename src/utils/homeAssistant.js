// Imports
import {createRetryClient} from "./axiosClient.js";
import {reportError} from "./reportError.js";

// Axios instance for Home Assistant API
const haClient = createRetryClient({
    baseURL: process.env.HA_BASE_URL,
    timeout: 8000,
    headers: {
        "Authorization": `Bearer ${process.env.HA_TOKEN}`,
        "Content-Type": "application/json",
    },
});

const lockEntityId = process.env.HA_LOCK_ENTITY_ID;

// Gets the door's state: "locked", "unlocked", "unavailable"
export const getLockState = async () => {
    try {
        const res = await haClient.get(`/api/states/${lockEntityId}`);
        return res.data.state;

    } catch (error) {
        throw reportError("homeAssistant.getLockState", error, {
            context: {status: error.response?.status, responseBody: error.response?.data},
            userMessage: "❌ Couldn't reach the lock right now",
        });
    }
};

// Locks the door
export const lockDoor = async () => {
    try {
        await haClient.post("/api/services/lock/lock", {entity_id: lockEntityId});

    } catch (error) {
        throw reportError("homeAssistant.lockDoor", error, {
            context: {status: error.response?.status, responseBody: error.response?.data},
            userMessage: "❌ Couldn't lock the door right now",
        });
    }
};

// Unlocks the door
export const unlockDoor = async () => {
    try {
        await haClient.post("/api/services/lock/unlock", {entity_id: lockEntityId});

    } catch (error) {
        throw reportError("homeAssistant.unlockDoor", error, {
            context: {status: error.response?.status, responseBody: error.response?.data},
            userMessage: "❌ Couldn't unlock the door right now",
        });
    }
};
