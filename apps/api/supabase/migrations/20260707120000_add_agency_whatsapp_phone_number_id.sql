-- Map each agency to its WhatsApp Cloud API business number.
-- The webhook payload carries metadata.phone_number_id (the number that
-- received the message); this column lets the backend resolve which agency
-- (tenant) an inbound message belongs to. UNIQUE both enforces one agency per
-- number and provides the index for the lookup by phone_number_id.

alter table agencies
  add column whatsapp_phone_number_id TEXT UNIQUE;
