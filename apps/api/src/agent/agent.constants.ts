/**
 * Claude model powering Luca. Overridable via the `ANTHROPIC_MODEL` env var.
 * Pinned to Haiku for latency/cost on high-volume WhatsApp traffic (per CLAUDE.md).
 */
export const DEFAULT_AGENT_MODEL = 'claude-haiku-4-5';

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
