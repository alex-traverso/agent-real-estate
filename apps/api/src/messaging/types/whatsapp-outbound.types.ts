/**
 * Typed shapes for the WhatsApp Cloud API outbound message endpoint (Meta).
 * Transport-level types specific to the messaging feature — kept local (not
 * in packages/types, which is for DB row shapes). Only the fields the app
 * sends/reads are typed; the rest of Meta's contract is omitted.
 *
 * Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
 */

export interface WhatsAppOutboundTextMessage {
  messaging_product: 'whatsapp';
  to: string; // recipient phone number (wa_id)
  type: 'text';
  text: { body: string };
}

/**
 * Response returned by the send endpoint. We only read the message id so we
 * can correlate the outbound message with later delivery/read statuses.
 */
export interface WhatsAppOutboundResponse {
  messaging_product: 'whatsapp';
  contacts?: { input: string; wa_id: string }[];
  messages?: { id: string }[];
}
