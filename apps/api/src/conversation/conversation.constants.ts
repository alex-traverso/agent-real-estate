/**
 * A new conversation is started once an existing active one has been idle for
 * this long (8 hours). Mirrors the session timeout in ARCHITECTURE.md.
 */
export const SESSION_TIMEOUT_MS = 8 * 60 * 60 * 1000;

/**
 * Max messages (both roles combined) per conversation before WebhookService
 * hands off to a human advisor instead of calling the agent — see
 * WebhookService.replyAndPersist.
 */
export const MAX_MESSAGES = 50;
