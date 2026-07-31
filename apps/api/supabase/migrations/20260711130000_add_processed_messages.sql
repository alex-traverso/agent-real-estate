-- ============================================================
-- Idempotency: dedup inbound WhatsApp messages by Meta's message.id (wamid)
-- Meta can redeliver the same webhook event (e.g. a slow/lost 200 response);
-- without this, Luca would reply twice, double-persist the turn, and double-
-- spend rate-limit + Claude tokens for the same message. The UNIQUE
-- constraint is the atomic dedup barrier: on a concurrent double-delivery,
-- exactly one insert wins and the other gets a unique violation (23505).
--
-- Retention: rows are not pruned yet (deferred follow-up). Meta retries
-- within a short window, so unpruned growth is negligible at this volume.
-- When ready, enable via pg_cron (already available in this project):
--   create extension if not exists pg_cron with schema extensions;
--   select cron.schedule('prune-processed-messages', '0 3 * * *',
--     $$delete from processed_messages where created_at < now() - interval '2 days'$$);
-- The index below already supports that prune query.
-- ============================================================

create table processed_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (agency_id, message_id)
);

create index idx_processed_messages_created_at on processed_messages(created_at);

alter table processed_messages enable row level security;
-- No policies: internal bookkeeping table, not exposed to the admin panel.
-- RLS is enabled with no policies, so anon/authenticated get no access; only
-- the backend's service_role (which bypasses RLS) can read/write it. Mirrors
-- rate_limits.

grant select, insert, update, delete on processed_messages
  to authenticated, service_role;
