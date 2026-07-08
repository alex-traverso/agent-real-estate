import { Injectable, Logger } from '@nestjs/common';
import { WhatsAppService } from '../messaging/whatsapp.service';
import { PLACEHOLDER_REPLY_ES } from './webhook.constants';
import { isTextMessage } from './types/whatsapp-webhook.types';
import type {
  WhatsAppMessage,
  WhatsAppWebhookPayload,
} from './types/whatsapp-webhook.types';

/**
 * Orchestrates inbound WhatsApp webhook events: extracts messages, logs them,
 * and (for now) replies to text messages with a fixed placeholder. This is the
 * seam where conversation loading and the agent will plug in later.
 */
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(private readonly whatsapp: WhatsAppService) {}

  /**
   * Fire-and-forget entry point used by the controller. The reply is dispatched
   * but not awaited so Meta gets a fast 200 (a slow/non-200 response makes Meta
   * retry the same event, causing duplicate replies). The attached .catch is
   * mandatory: an unhandled promise rejection can crash the Node process.
   */
  handleInbound(payload: WhatsAppWebhookPayload): void {
    void this.processInbound(payload).catch((error) => {
      this.logger.error(
        `[WebhookService] Unhandled error processing inbound webhook | error: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    });
  }

  /**
   * Awaitable core of the inbound handling. Only text messages get a reply;
   * status webhooks (delivery/read) carry `statuses`, not `messages`, so they
   * yield nothing here — this is what prevents a reply storm where our own
   * outbound receipts would re-trigger a send.
   */
  async processInbound(payload: WhatsAppWebhookPayload): Promise<void> {
    for (const message of this.extractMessages(payload)) {
      this.logMessage(message);

      // TODO(idempotency): dedup on message.id — Meta retries can redeliver
      // the same message once conversation persistence lands.
      if (!isTextMessage(message)) {
        continue; // images/audio/location/interactive: no reply in this step
      }

      await this.whatsapp.sendText(message.from, PLACEHOLDER_REPLY_ES);
    }
  }

  private extractMessages(payload: WhatsAppWebhookPayload): WhatsAppMessage[] {
    const messages: WhatsAppMessage[] = [];
    for (const entry of payload?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        for (const message of change?.value?.messages ?? []) {
          messages.push(message);
        }
      }
    }
    return messages;
  }

  private logMessage(message: WhatsAppMessage): void {
    // Safe in every environment: masked phone + message id/type only.
    this.logger.log(
      `[WebhookService] Message received | from: ${this.maskPhone(
        message.from,
      )} | id: ${message.id} | type: ${message.type}`,
    );

    // Dev-only: show the full sender and body so the Meta connection can be
    // verified locally. Never emitted in production (SECURITY.md).
    if (process.env.NODE_ENV !== 'production') {
      const body = isTextMessage(message) ? message.text.body : '(non-text)';
      this.logger.debug(
        `[WebhookService] (dev) from: ${message.from} | body: ${body}`,
      );
    }
  }

  private maskPhone(phone: string): string {
    if (!phone) {
      return 'unknown';
    }
    return `***${phone.slice(-4)}`;
  }
}
