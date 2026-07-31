-- ============================================================
-- Rate limiting: one row per (agency_id, phone)
-- Enables RateLimitService to upsert the window in place instead of
-- inserting a new row every window, so there is nothing to periodically
-- clean up.
-- ============================================================

ALTER TABLE rate_limits
  ADD CONSTRAINT rate_limits_agency_phone_unique UNIQUE (agency_id, phone);
