// Imports
import {createRetryClient, defaultRetryCondition} from "./axiosClient.js";
import {reportError} from "./reportError.js";

// A 504 means gateway timed out, don't retry
const gatewayRetryCondition = (error) =>
    error.response?.status !== 504 && defaultRetryCondition(error);

// Axios instance for Claude Code Gateway
const gatewayClient = createRetryClient({
    baseURL: process.env.CLAUDE_CODE_GATEWAY_URL,
    timeout: 185000, // ~3min, just over the gateway's own 3min timeout
    headers: {
        "Authorization": `Bearer ${process.env.CLAUDE_CODE_GATEWAY_SECRET_GUIDO}`,
        "Content-Type": "application/json",
    },
}, 1, gatewayRetryCondition);

// Forwards a prompt to Claude Code
export const runPrompt = async (prompt) => {
    try {
        const res = await gatewayClient.post("/run", {prompt});
        return res.data;

    } catch (error) {
        throw reportError("claudeCode.runPrompt", error, {
            context: {prompt, status: error.response?.status, responseBody: error.response?.data},
            userMessage: "❌ Claude Code error",
        });
    }
};