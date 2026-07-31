import { Injectable, Logger } from '@nestjs/common';
import { WhatsAppService } from '../messaging/whatsapp.service';
import { AgencyService } from '../agency/agency.service';
import { ConversationService } from '../conversation/conversation.service';
import { AgentService } from '../agent/agent.service';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { EscalationService } from '../escalation/escalation.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { MAX_MESSAGES } from '../conversation/conversation.constants';
import type { StoredMessage } from '../conversation/types/stored-message.type';
import type { TokenUsage } from '../conversation/types/token-usage.type';
import type { SaveLeadInput } from '../leads/types/lead-input.type';
import { sanitizeLeadName } from '../leads/lead-name.util';
import type { Tables } from 'types';
import {
  FALLBACK_REPLY_ES,
  MESSAGE_CAP_NOTE,
  MESSAGE_CAP_REPLY_ES,
  RATE_LIMIT_REPLY_ES,
} from './webhook.constants';
import { isTextMessage } from './types/whatsapp-webhook.types';
import type {
  WhatsAppContact,
  WhatsAppMessage,
  WhatsAppTextMessage,
  WhatsAppWebhookPayload,
} from './types/whatsapp-webhook.types';

type Conversation = Tables<'conversations'>;

/**
 * Orchestrates inbound WhatsApp webhook events: resolves the tenant, dedups
 * Meta redeliveries, checks the rate limit, loads or creates the
 * conversation, persists the exchange, and replies. The reply is produced by
 * Luca (the Claude agent); if the agent fails, a generic Spanish fallback is
 * sent so the client never sees an internal error. A message already
 * processed (see IdempotencyService) or a phone over its rate limit never
 * reaches the agent at all — see RateLimitService.
 */
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly whatsapp: WhatsAppService,
    private readonly agencyService: AgencyService,
    private readonly conversationService: ConversationService,
    private readonly agent: AgentService,
    private readonly rateLimit: RateLimitService,
    private readonly escalation: EscalationService,
    private readonly idempotency: IdempotencyService,
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
    for (const entry of payload?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value;
        const phoneNumberId = value?.metadata?.phone_number_id;

        for (const message of value?.messages ?? []) {
          this.logMessage(message);

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

          const firstDelivery = await this.idempotency.checkAndMark(
            agencyId,
            message.id,
          );
          if (!firstDelivery) {
            // Meta redelivered a message we already handled — skip silently:
            // no reply, no rate-limit consumption, no persistence, no Claude call.
            continue;
          }

          const allowed = await this.rateLimit.checkAndIncrement(
            agencyId,
            message.from,
          );
          if (!allowed) {
            // First cost/spam barrier: no ConversationService, no
            // AgentService (Claude) call, nothing persisted — the cheapest
            // possible path for a phone over its message limit.
            await this.whatsapp.sendText(message.from, RATE_LIMIT_REPLY_ES);
            continue;
          }

          const contactName = this.resolveContactName(
            value?.contacts,
            message.from,
          );
          await this.replyAndPersist(agencyId, message, contactName);
        }
      }
    }
  }

  /**
   * Looks up the WhatsApp profile display name for `phone` among the change
   * value's `contacts`, matched strictly by `wa_id` — never taken positionally
   * (a value can carry contacts for other recipients). Sanitized before use
   * since it is client-chosen, untrusted data (often a nickname or emoji).
   */
  private resolveContactName(
    contacts: WhatsAppContact[] | undefined,
    phone: string,
  ): string | undefined {
    const contact = contacts?.find((c) => c.wa_id === phone);
    return sanitizeLeadName(contact?.profile?.name);
  }

  /**
   * Persists the inbound message, asks the agent for a reply, sends it, and
   * persists the reply. The inbound message is saved before sending so it is not
   * lost if the send fails. The prior history is snapshotted before appending
   * the inbound turn, since the agent expects history that excludes it. A
   * conversation that already hit MAX_MESSAGES is diverted to escalateAtCap
   * instead — no agent call, no history append for this message.
   */
  private async replyAndPersist(
    agencyId: string,
    message: WhatsAppTextMessage,
    contactName?: string,
  ): Promise<void> {
    let conversation = await this.conversationService.getOrCreateActive(
      agencyId,
      message.from,
    );

    if ((conversation.message_count ?? 0) >= MAX_MESSAGES) {
      await this.escalateAtCap(
        agencyId,
        conversation,
        message.from,
        contactName,
      );
      return;
    }

    // History as seen by the agent must NOT include the incoming turn yet.
    const priorHistory =
      (conversation.messages as unknown as StoredMessage[]) ?? [];

    const userMessage: StoredMessage = {
      role: 'user',
      content: message.text.body,
      timestamp: new Date().toISOString(),
      whatsapp_message_id: message.id,
    };
    conversation = await this.conversationService.appendMessages(conversation, [
      userMessage,
    ]);

    const { reply, usage } = await this.generateReply(
      agencyId,
      conversation.id,
      message,
      priorHistory,
      contactName,
    );

    await this.whatsapp.sendText(message.from, reply);

    const assistantMessage: StoredMessage = {
      role: 'assistant',
      content: reply,
      timestamp: new Date().toISOString(),
    };
    // Persist the assistant turn together with the tokens it cost. On agent
    // failure `usage` is null (no successful Claude call), so token totals are
    // left untouched.
    await this.conversationService.appendMessages(
      conversation,
      [assistantMessage],
      usage ?? undefined,
    );
  }

  /**
   * Handles a conversation that already hit MAX_MESSAGES: escalates (saves a
   * lead + notifies the advisor, via the same EscalationService the agent's
   * `escalate_to_advisor` tool uses), marks the conversation `escalated`, and
   * tells the client. No AgentService/Claude call — the cheapest possible path,
   * same posture as RateLimitService's blocked path. If the escalation itself
   * fails, the client gets the generic fallback instead and the conversation
   * is left `active` so the next message retries the cap check.
   */
  private async escalateAtCap(
    agencyId: string,
    conversation: Conversation,
    phone: string,
    contactName?: string,
  ): Promise<void> {
    try {
      const input: SaveLeadInput = {
        phone,
        name: contactName,
        notes: MESSAGE_CAP_NOTE,
      };
      await this.escalation.escalate(agencyId, input, conversation.id);
      await this.conversationService.markEscalated(conversation.id, agencyId);
      await this.whatsapp.sendText(phone, MESSAGE_CAP_REPLY_ES);
    } catch (error) {
      this.logger.error(
        `[WebhookService] Failed to escalate at message cap | conversationId: ${
          conversation.id
        } | error: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      await this.whatsapp.sendText(phone, FALLBACK_REPLY_ES);
    }
  }

  /**
   * Runs the agent to produce Luca's reply and the tokens it cost. Any agent
   * failure is logged and converted to a generic Spanish fallback — the
   * internal error is never surfaced to the client — with `usage: null` so no
   * token totals are recorded for a turn that never reached Claude.
   */
  private async generateReply(
    agencyId: string,
    conversationId: string,
    message: WhatsAppTextMessage,
    priorHistory: StoredMessage[],
    contactName?: string,
  ): Promise<{ reply: string; usage: TokenUsage | null }> {
    try {
      const { reply, usage } = await this.agent.processMessage({
        agencyId,
        conversationId,
        clientPhone: message.from,
        contactName,
        history: priorHistory,
        userText: message.text.body,
      });
      return { reply, usage };
    } catch (error) {
      this.logger.error(
        `[WebhookService] Agent failed, sending fallback | conversationId: ${conversationId} | error: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      return { reply: FALLBACK_REPLY_ES, usage: null };
    }
  }

  private logMessage(message: WhatsAppMessage): void {
    // Safe in every environment: masked phone + message id/type only. No
    // NODE_ENV-gated verbose variant — a misconfigured deploy platform that
    // never sets NODE_ENV=production would otherwise leak the full phone
    // number and message content into production logs (SECURITY.md).
    this.logger.log(
      `[WebhookService] Message received | from: ${this.maskPhone(
        message.from,
      )} | id: ${message.id} | type: ${message.type}`,
    );
  }

  private maskPhone(phone: string): string {
    if (!phone) {
      return 'unknown';
    }
    return `***${phone.slice(-4)}`;
  }
}
