// Import
import * as Sentry from "@sentry/node";

// Reports an error to Sentry with a tagged operation and optional context, then attaches a user-facing message
export function reportError(operation, error, {context, userMessage} = {}) {
    Sentry.withScope((scope) => {
        scope.setTag("operation", operation);
        if (context) scope.setContext("payload", context);
        Sentry.captureException(error);
    });

    if (userMessage) error.userMessage = userMessage;

    return error;
}
