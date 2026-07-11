-- ============================================================
-- Per-conversation token usage: accumulated Claude token counts
-- Persists the token usage that AgentService already logs per call,
-- summed across every turn of the conversation, for cost-per-lead
-- visibility. Maps 1:1 to Anthropic.Usage (input / output /
-- cache_creation / cache_read). NOT NULL DEFAULT 0 so existing rows
-- start at zero without a backfill and the code never handles null.
-- conversations already has RLS + GRANTs (initial_schema), so adding
-- columns needs no new GRANT.
-- ============================================================

ALTER TABLE conversations
  ADD COLUMN total_input_tokens          BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN total_output_tokens         BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN total_cache_creation_tokens BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN total_cache_read_tokens     BIGINT NOT NULL DEFAULT 0;
