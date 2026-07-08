/**
 * A new conversation is started once an existing active one has been idle for
 * this long (8 hours). Mirrors the session timeout in ARCHITECTURE.md.
 */
export const SESSION_TIMEOUT_MS = 8 * 60 * 60 * 1000;

/**
 * Max messages per conversation before handing off to a human advisor.
 * Enforcement (escalate_to_advisor + notifications) is not built yet — this
 * constant is reserved for that step. See the agent iteration.
 */
export const MAX_MESSAGES = 50;
