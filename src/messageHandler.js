// Imports
import sanitizeHtml from "sanitize-html";
import {URL} from "node:url";
import {writeFile} from "node:fs/promises";
import * as Sentry from "@sentry/node";
import {Vonage} from "@vonage/server-sdk";
import {Channels} from "@vonage/messages";
import {reportError} from "./utils/reportError.js";

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
        const MAX_MEDIA_SIZE = 10 * 1024 * 1024; // 10MB
        const response = await fetch(parsedUrl.href);

        // Validate file size — TODO: byteLength check below may be redundant for trusted Vonage CDN
        const contentLength = parseInt(response.headers.get("content-length"), 10);
        if (contentLength > MAX_MEDIA_SIZE) {
            Sentry.logger.error("Media file too large", {contentLength, messageID});
            throw new Error("Media file too large");
        }

        // Convert response to buffer
        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength > MAX_MEDIA_SIZE) {
            Sentry.logger.error("Media file too large", {byteLength: arrayBuffer.byteLength, messageID});
            throw new Error("Media file too large");
        }
        const buffer = Buffer.from(arrayBuffer);

        // Save in local folder - TODO: upload media to Google Cloud Storage
        await writeFile(`/home/ubuntu/guido/media/${messageID}.${extension}`, buffer);

        // Convert to base64 for LLM call
        return buffer.toString("base64");

    } catch (error) {
        throw reportError("getMedia", error, {
            context: {mediaURL, messageID, extension},
            userMessage: "❌ Media processing error",
        });
    }
}

// Process message
export async function receiveMessage(messageBody) {
    // Validate sender
    if (messageBody.from !== process.env.PHONE_NUMBER) {
        Sentry.logger.warn("Unauthorized phone number", {phoneNumber: messageBody.from});

        return {validation: "⚠️ Unauthorized"};
    }

    // Validate timestamp before it flows into the database query
    const timestamp = new Date(messageBody.timestamp);
    if (isNaN(timestamp.getTime())) {
        Sentry.logger.warn("Invalid message timestamp", {timestamp: messageBody.timestamp});

        return {validation: "⚠️ Invalid timestamp"};
    }

    // Extract relevant data from message
    let message = {
        id: messageBody.message_uuid,
        timestamp,
        type: messageBody.message_type,
    };

    // Text message
    if (message.type === "text") {
        // Sanitize and validate message text
        message.content = sanitizeText(messageBody.text);
        message.validation = "OK";

    // Media message - "audio", "image", or "file"
    } else if (message.type === "audio" || message.type === "image" || message.type === "file") {
        // Get file extension
        message.extension = messageBody[message.type].name.split(".").pop();

        // Get media file
        message.content = await getMedia(messageBody[message.type].url, message.id, message.extension);

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
export async function sendMessage(messageText) {
    try {
        await vonage.messages.send({
            from: "14157386102",
            to: process.env.PHONE_NUMBER,
            channel: Channels.WHATSAPP,
            messageType: "text",
            text: messageText,
        });
    
    } catch (error) {
        throw reportError("sendMessage", error, {
            context: {messageText},
            userMessage: "❌ Message sending error",
        });
    }
}
