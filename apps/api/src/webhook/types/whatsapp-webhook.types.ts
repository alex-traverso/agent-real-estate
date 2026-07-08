/**
 * Typed shape of the WhatsApp Cloud API webhook payload (Meta).
 * Transport-level types specific to the webhook — kept local to the
 * feature (not in packages/types, which is for DB row shapes).
 *
 * Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
 * Only the fields the app currently reads are typed; the rest of Meta's
 * payload is intentionally omitted.
 */

export interface WhatsAppMessage {
  from: string; // client's phone number (wa_id)
  id: string; // Meta message id — used for idempotency later
  timestamp: string;
  type: string; // 'text' | 'image' | 'audio' | 'location' | 'interactive' | ...
  text?: { body: string };
  [key: string]: unknown; // non-text payloads carry other keys we don't read yet
}

export interface WhatsAppContact {
  profile: { name: string };
  wa_id: string;
}

/**
 * Delivery/read receipts. Meta sends these on the same webhook as
 * inbound messages; they carry `statuses` instead of `messages`.
 */
export interface WhatsAppStatus {
  id: string;
  status: string;
  timestamp: string;
  recipient_id: string;
}

export interface WhatsAppChangeValue {
  messaging_product: 'whatsapp';
  metadata: {
    display_phone_number: string;
    phone_number_id: string; // identifies which business number received the message
  };
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
  statuses?: WhatsAppStatus[];
}

export interface WhatsAppChange {
  field: string; // 'messages'
  value: WhatsAppChangeValue;
}

export interface WhatsAppEntry {
  id: string;
  changes: WhatsAppChange[];
}

export interface WhatsAppWebhookPayload {
  object: string; // 'whatsapp_business_account'
  entry: WhatsAppEntry[];
}

export type WhatsAppTextMessage = WhatsAppMessage & { text: { body: string } };

export function isTextMessage(
  message: WhatsAppMessage,
): message is WhatsAppTextMessage {
  return message.type === 'text' && typeof message.text?.body === 'string';
}
