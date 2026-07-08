import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GRAPH_API_BASE_URL,
  GRAPH_API_VERSION,
  WHATSAPP_MESSAGING_PRODUCT,
} from './messaging.constants';
import { normalizeWhatsAppRecipient } from './phone.util';
import type {
  WhatsAppOutboundResponse,
  WhatsAppOutboundTextMessage,
} from './types/whatsapp-outbound.types';

/**
 * Sends outbound WhatsApp messages via the Meta Cloud API. This service is
 * intentionally generic: it knows nothing about webhooks, conversations, or
 * the agent, so it can be reused by any consumer (webhook replies, agent
 * responses, notifications) that needs to message a client.
 */
@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly apiToken: string;
  private readonly phoneNumberId: string;

  constructor(configService: ConfigService) {
    // Fail fast on boot if either credential is missing — a misconfigured
    // sender should crash the app, not silently fail at the first message.
    this.apiToken = configService.getOrThrow<string>('META_API_TOKEN');
    this.phoneNumberId = configService.getOrThrow<string>(
      'META_PHONE_NUMBER_ID',
    );
  }

  /**
   * Sends a plain text message to a recipient. Returns the Meta message id
   * on success. Throws on network failure or a non-2xx response so callers
   * can decide how to react (the webhook path swallows and logs it).
   */
  async sendText(to: string, body: string): Promise<string> {
    // Normalize the recipient to the form Meta expects for sending (e.g. strip
    // the Argentine mobile `9`), otherwise sends are rejected with 131030.
    const recipient = normalizeWhatsAppRecipient(to);
    const url = `${GRAPH_API_BASE_URL}/${GRAPH_API_VERSION}/${this.phoneNumberId}/messages`;
    const payload: WhatsAppOutboundTextMessage = {
      messaging_product: WHATSAPP_MESSAGING_PRODUCT,
      to: recipient,
      type: 'text',
      text: { body },
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      this.logger.error(
        `[WhatsAppService] Network error sending message | to: ${this.maskPhone(
          recipient,
        )} | error: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      throw error;
    }

    if (!response.ok) {
      // Meta returns a structured { error } body; it never contains our token.
      const errorBody = await response.text();
      this.logger.error(
        `[WhatsAppService] Meta API rejected send | to: ${this.maskPhone(
          recipient,
        )} | status: ${response.status} | body: ${errorBody}`,
      );
      throw new Error(`WhatsApp send failed with status ${response.status}`);
    }

    const data = (await response.json()) as WhatsAppOutboundResponse;
    const messageId = data.messages?.[0]?.id ?? 'unknown';
    this.logger.log(
      `[WhatsAppService] Message sent | to: ${this.maskPhone(
        recipient,
      )} | id: ${messageId}`,
    );
    return messageId;
  }

  private maskPhone(phone: string): string {
    if (!phone) {
      return 'unknown';
    }
    return `***${phone.slice(-4)}`;
  }
}
