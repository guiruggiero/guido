// Imports
import {verifySignature} from "@vonage/jwt";
import * as Sentry from "@sentry/node";

// Validates WhatsApp webhook signature
export function validateWhatsAppAuth(request) {
    // Get signature from header
    const authHeader = request.headers.authorization;
    const signature = authHeader?.split(" ")[1];
    const valid = signature && verifySignature(signature, process.env.VONAGE_SIGNATURE_SECRET);

    if (!valid) {
        Sentry.logger.warn("GuiDo: unauthorized request", {
            authHeaderPresent: !!authHeader,
            reason: authHeader ? "Invalid signature" : "No signature",
        });

        const error = new Error(authHeader ? "Invalid signature" : "No signature");
        error.userMessage = "❌ Unauthorized";
        error.isAuthError = true; // Flags app.js to skip replying to an unauthenticated caller
        throw error;
    }
}

// Validates Index 01 webhook bearer token
export function validateIndexAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token || token !== process.env.INDEX_WEBHOOK_SECRET) {
        Sentry.logger.warn("Guindex: unauthorized request", {
            authHeaderPresent: !!authHeader,
            reason: authHeader ? "Invalid token" : "No token",
        });
        return res.status(401).end();
    }

    next();
}