// Imports
import {verifySignature} from "@vonage/jwt";
import * as Sentry from "@sentry/node";

// Validates the Vonage webhook signature
export function validateSignature(request) {
    // Get signature from header
    const authHeader = request.headers.authorization;
    const signature = authHeader?.split(" ")[1];
    const valid = signature && verifySignature(signature, process.env.VONAGE_SIGNATURE_SECRET);

    if (!valid) {
        Sentry.logger.warn("GuiDo: unauthorized request", {
            authHeaderPresent: !!authHeader,
            reason: authHeader ? "Invalid signature" : "No signature",
        });

        throw new Error(authHeader ? "Invalid signature" : "No signature");
    }
}
