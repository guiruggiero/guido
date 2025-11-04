// Imports
import {verifySignature} from "@vonage/jwt";
import sanitizeHtml from "sanitize-html";
import {URL} from "node:url";
import fs from "node:fs/promises";
import * as Sentry from "@sentry/node";
import {Vonage} from "@vonage/server-sdk";
import {Channels} from "@vonage/messages";

// Validate message signature
export function validateSignature(request) {
    // Get signature from header
    const signature = request.headers.authorization.split(" ")[1];
    if (!signature) throw new Error("No signature");

    // Validate signature
    if (!verifySignature(signature, process.env.VONAGE_SIGNATURE_SECRET)) throw new Error("Invalid signature");
}

// Sanitize text message
function sanitizeText(messageText) {
    // Normalize whitespace
    let sanitizedMessage = messageText.replace(/\s+/g, " ");

    // Remove whitespace from both ends
    sanitizedMessage = sanitizedMessage.trim();
    
    // Remove HTML tags and attributes
    sanitizedMessage = sanitizeHtml(sanitizedMessage, { 
        allowedTags: [],
        allowedAttributes: {},
    });

    return sanitizedMessage;
}

// Get media file
async function getMedia(mediaURL, messageID, extension) {
    try {
        // Prevent Server-Side Request Forgery (SSRF)
        const parsedUrl = new URL(mediaURL);
        if (!parsedUrl.hostname.endsWith(".nexmo.com")) throw new Error("Untrusted media URL");

        // Get media
        const response = await fetch(mediaURL);

        // Convert response to buffer
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Save in local folder
        await fs.writeFile(`/home/ubuntu/guido/media/${messageID}.${extension}`, buffer);

        // Convert to base64 for LLM call
        return buffer.toString("base64");

    } catch (error) {
        Sentry.withScope((scope) => {
            scope.setTag("operation", "getMedia");
            scope.setContext("payload", {
                mediaURL,
                messageID,
                extension,
            });
            Sentry.captureException(error);
        });

        // Rethrow to show user a message
        error.userMessage = "❌ Media processing error";
        throw error;
    }
}

// Process message
export async function receiveMessage(messageBody) {
    // Validate sender
    if (messageBody.from !== process.env.PHONE_NUMBER) {
        Sentry.logger.warn("Unauthorized phone number", {phoneNumber: messageBody.from});

        return {validation: "⚠️ Unauthorized"};
    }

    // Extract relevant data from message
    let message = {
        id: messageBody.message_uuid,
        timestamp: new Date(messageBody.timestamp),
        type: messageBody.message_type,
    };

    // Text message
    if (message.type === "text") {
        // Sanitize and validate message text
        message.content = sanitizeText(messageBody.text);
        message.validation = "OK";

    // Media message - "audio", "image", or "file"
    } else if (message.type === "audio" || message.type === "image" || message.type === "file") {
        // Get media file
        message.content = await getMedia(messageBody[message.type].url, message.id, messageBody[message.type].name.split(".")[1]);

        message.validation = "OK";

    // Message types not supported
    } else message.validation = "⚠️ Message type not supported";

    return message;
}

// Initialize Vonage client
const vonage = new Vonage(
    {
        apiKey: process.env.VONAGE_API_KEY,
        apiSecret: process.env.VONAGE_API_SECRET,
        privateKey: "", // Disable JWT auth
    },
    {apiHost: "https://messages-sandbox.nexmo.com"},
);

// Send response back
export  function sendMessage(messageText) {
    try {
        vonage.messages.send({
            from: "14157386102",
            to: process.env.PHONE_NUMBER,
            channel: Channels.WHATSAPP,
            messageType: "text",
            text: messageText,
        });
    
    } catch (error) {
        Sentry.withScope((scope) => {
            scope.setTag("operation", "sendMessage");
            scope.setContext("payload", {messageText});
            Sentry.captureException(error);
        });

        // Rethrow to show user a message
        error.userMessage = "❌ Message sending error";
        throw error;
    }
}