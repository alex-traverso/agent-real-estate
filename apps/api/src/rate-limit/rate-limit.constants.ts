/**
 * Max messages a single phone may send within the window before Luca stops
 * replying and the client gets a polite rate-limit notice instead (no
 * ConversationService, no Claude call — the cheapest possible path).
 */
export const RATE_LIMIT_MAX_MESSAGES = 20;

/** Rolling window size for the message count above. */
export const RATE_LIMIT_WINDOW_MS = 60 * 1000;
