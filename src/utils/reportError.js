// Import
import * as Sentry from "@sentry/node";

// Reports the first, most specific operation to Sentry with context and user message
export function reportError(operation, error, {context, userMessage} = {}) {
    if (!error.reported) {
        Sentry.withScope((scope) => {
            scope.setTag("operation", operation);
            if (context) scope.setContext("payload", context);
            Sentry.captureException(error);
        });
        error.reported = true;
    }

    if (userMessage) error.userMessage = userMessage;

    return error;
}