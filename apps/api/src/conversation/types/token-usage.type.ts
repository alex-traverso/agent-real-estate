/**
 * Accumulated Claude token usage for a single agent turn (summed across every
 * Claude call the tool loop makes) or, once persisted, for a whole conversation.
 * Maps 1:1 to the fields of `Anthropic.Usage`, renamed to camelCase:
 * input_tokens, output_tokens, cache_creation_input_tokens,
 * cache_read_input_tokens. Used to persist per-conversation token totals in the
 * `conversations` table for cost-per-lead visibility.
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}
