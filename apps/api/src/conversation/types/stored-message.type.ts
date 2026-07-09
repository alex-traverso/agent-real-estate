/**
 * Shape of a single message stored in `conversations.messages` (JSONB).
 * Modeled on the Anthropic Messages API ({ role, content }) so the history
 * can be handed to Claude with minimal mapping once the agent is built. The
 * extra fields (timestamp, whatsapp_message_id) are for traceability and are
 * stripped before sending to Claude.
 */
export interface StoredMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string; // ISO 8601
  whatsapp_message_id?: string; // Meta wamid — only on inbound user messages
}
