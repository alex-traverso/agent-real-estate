/**
 * How long AgencyService keeps a resolved agency in its in-process caches.
 *
 * The caches exist because the WhatsApp `phone_number_id` -> agency mapping is
 * hit on every inbound message and almost never changes. But "almost never" is
 * not "never": an agency can now edit its own `whatsapp_phone_number_id` from
 * the admin panel. The instance that serves that PATCH evicts its own entries
 * immediately; on a multi-instance deploy the *other* instances would keep a
 * stale mapping forever — including the dangerous case where agency A frees a
 * number and agency B claims it, which would route B's messages to A. The TTL
 * is what makes those instances heal on their own.
 */
export const AGENCY_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Meta Cloud API `phone_number_id` shape: a numeric id (15 digits today). The
 * bounds are deliberately loose — this guards against a pasted phone number or
 * display name, not against a wrong-but-well-formed id, which only Meta can
 * tell us about.
 */
export const WHATSAPP_PHONE_NUMBER_ID_PATTERN = /^\d{5,20}$/;
