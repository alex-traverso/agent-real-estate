/**
 * Claude model powering Luca. Overridable via the `ANTHROPIC_MODEL` env var.
 * Sonnet 4.6 over Sonnet 5: same list price long-term, but Sonnet 4.6's older
 * tokenizer uses ~30% fewer tokens for the same text, and it runs without
 * thinking by default (see createMessage) — both keep per-message cost down
 * for high-volume WhatsApp traffic. Chosen over Haiku for conversational
 * naturalness; cost is offset by prompt caching (see agent.service.ts).
 */
export const DEFAULT_AGENT_MODEL = 'claude-sonnet-4-6';

/**
 * Max tokens per Claude completion. WhatsApp replies are short, so this is a
 * safety ceiling, not a target.
 */
export const MAX_OUTPUT_TOKENS = 1024;

/**
 * Upper bound on tool-call round-trips within a single `processMessage` turn
 * (Claude → tool_use → tool_result → …). Guards against a runaway loop. Wired
 * in Epic 6 Phase 4 when tools are added.
 */
export const MAX_TOOL_ITERATIONS = 5;
