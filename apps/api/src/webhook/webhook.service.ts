import { Injectable, Logger } from '@nestjs/common';
import { WhatsAppService } from '../messaging/whatsapp.service';
import { AgencyService } from '../agency/agency.service';
import { ConversationService } from '../conversation/conversation.service';
import type { StoredMessage } from '../conversation/types/stored-message.type';
import { PLACEHOLDER_REPLY_ES } from './webhook.constants';
import { isTextMessage } from './types/whatsapp-webhook.types';
import type {
  WhatsAppMessage,
  WhatsAppTextMessage,
  WhatsAppWebhookPayload,
} from './types/whatsapp-webhook.types';

/**
 * Orchestrates inbound WhatsApp webhook events: resolves the tenant, loads or
 * creates the conversation, persists the exchange, and replies. For now the
 * reply is a fixed placeholder; the agent will plug in where the reply text is
 * produced.
 */
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly whatsapp: WhatsAppService,
    private readonly agencyService: AgencyService,
    private readonly conversationService: ConversationService,
  ) {}

  /**
   * Fire-and-forget entry point used by the controller. The work is dispatched
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
   * Awaitable core. Iterates per change so each message keeps its
   * `metadata.phone_number_id` (used to resolve the tenant). Only text messages
   * are answered; status webhooks (delivery/read) carry `statuses`, not
   * `messages`, so they yield nothing here — the reply-storm guard.
   */
  async processInbound(payload: WhatsAppWebhookPayload): Promise<void> {
    // console.log(`Full Payload: `, JSON.stringify(payload, null, 2));

    for (const entry of payload?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value;
        const phoneNumberId = value?.metadata?.phone_number_id;

        for (const message of value?.messages ?? []) {
          this.logMessage(message);

          // TODO(idempotency): dedup on message.id — Meta retries can redeliver
          // the same message.
          if (!isTextMessage(message)) {
            continue; // images/audio/location/interactive: no reply in this step
          }

          if (!phoneNumberId) {
            this.logger.warn(
              '[WebhookService] Message without phone_number_id | skipping',
            );
            continue;
          }

          const agencyId =
            await this.agencyService.resolveIdByPhoneNumberId(phoneNumberId);
          if (!agencyId) {
            continue; // unattributable — AgencyService already logged it
          }

          await this.replyAndPersist(agencyId, message);
        }
      }
    }
  }

  /**
   * Persists the inbound message, sends the reply, and persists the reply.
   * The inbound message is saved before sending, so it is not lost if the send
   * fails. The 50-message cap / escalation (ARCHITECTURE step 7) is not built
   * yet — see MAX_MESSAGES.
   */
  private async replyAndPersist(
    agencyId: string,
    message: WhatsAppTextMessage,
  ): Promise<void> {
    let conversation = await this.conversationService.getOrCreateActive(
      agencyId,
      message.from,
    );

    const userMessage: StoredMessage = {
      role: 'user',
      content: message.text.body,
      timestamp: new Date().toISOString(),
      whatsapp_message_id: message.id,
    };
    conversation = await this.conversationService.appendMessages(conversation, [
      userMessage,
    ]);

    await this.whatsapp.sendText(message.from, PLACEHOLDER_REPLY_ES);

    const assistantMessage: StoredMessage = {
      role: 'assistant',
      content: PLACEHOLDER_REPLY_ES,
      timestamp: new Date().toISOString(),
    };
    await this.conversationService.appendMessages(conversation, [
      assistantMessage,
    ]);
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
