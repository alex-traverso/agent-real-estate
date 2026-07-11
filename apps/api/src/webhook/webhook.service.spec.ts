import { WebhookService } from './webhook.service';
import {
  FALLBACK_REPLY_ES,
  MESSAGE_CAP_REPLY_ES,
  RATE_LIMIT_REPLY_ES,
} from './webhook.constants';
import { MAX_MESSAGES } from '../conversation/conversation.constants';
import type { WhatsAppService } from '../messaging/whatsapp.service';
import type { AgencyService } from '../agency/agency.service';
import type { ConversationService } from '../conversation/conversation.service';
import type { AgentService } from '../agent/agent.service';
import type { RateLimitService } from '../rate-limit/rate-limit.service';
import type { EscalationService } from '../escalation/escalation.service';
import type { WhatsAppWebhookPayload } from './types/whatsapp-webhook.types';

const AGENT_REPLY = 'Hola, soy Luca. ¿Buscás alquilar o comprar?';
const SAMPLE_USAGE = {
  inputTokens: 100,
  outputTokens: 20,
  cacheCreationTokens: 3000,
  cacheReadTokens: 500,
};

function conversation(messageCount = 0) {
  return {
    id: 'conv-1',
    agency_id: 'agency-1',
    message_count: messageCount,
    messages: [],
  };
}

function createService(
  opts: {
    agencyId?: string | null;
    rateLimitAllowed?: boolean;
    messageCount?: number;
    escalateFails?: boolean;
  } = {},
) {
  const sendText = jest.fn().mockResolvedValue('wamid.OUT');
  const resolveIdByPhoneNumberId = jest
    .fn()
    .mockResolvedValue(
      opts.agencyId === undefined ? 'agency-1' : opts.agencyId,
    );
  const CONVERSATION = conversation(opts.messageCount ?? 0);
  const getOrCreateActive = jest.fn().mockResolvedValue(CONVERSATION);
  const appendMessages = jest.fn().mockResolvedValue(CONVERSATION);
  const markEscalated = jest.fn().mockResolvedValue(undefined);
  const processMessage = jest
    .fn()
    .mockResolvedValue({ reply: AGENT_REPLY, usage: SAMPLE_USAGE });
  const checkAndIncrement = jest
    .fn()
    .mockResolvedValue(opts.rateLimitAllowed ?? true);
  const escalate = opts.escalateFails
    ? jest.fn().mockRejectedValue(new Error('resend down'))
    : jest.fn().mockResolvedValue({ id: 'lead-1' });

  const whatsapp = { sendText } as unknown as WhatsAppService;
  const agencyService = {
    resolveIdByPhoneNumberId,
  } as unknown as AgencyService;
  const conversationService = {
    getOrCreateActive,
    appendMessages,
    markEscalated,
  } as unknown as ConversationService;
  const agent = { processMessage } as unknown as AgentService;
  const rateLimit = { checkAndIncrement } as unknown as RateLimitService;
  const escalation = { escalate } as unknown as EscalationService;

  return {
    service: new WebhookService(
      whatsapp,
      agencyService,
      conversationService,
      agent,
      rateLimit,
      escalation,
    ),
    sendText,
    resolveIdByPhoneNumberId,
    getOrCreateActive,
    appendMessages,
    markEscalated,
    processMessage,
    checkAndIncrement,
    escalate,
  };
}

function textPayload(body = 'Hola', type = 'text'): WhatsAppWebhookPayload {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'entry-1',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15550001111',
                phone_number_id: 'pnid-123',
              },
              messages: [
                {
                  from: '5491122223333',
                  id: 'wamid.ABC',
                  timestamp: '1700000000',
                  type,
                  ...(type === 'text' ? { text: { body } } : {}),
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

const statusPayload: WhatsAppWebhookPayload = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'entry-1',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '15550001111',
              phone_number_id: 'pnid-123',
            },
            statuses: [
              {
                id: 'wamid.ABC',
                status: 'delivered',
                timestamp: '1700000000',
                recipient_id: '5491122223333',
              },
            ],
          },
        },
      ],
    },
  ],
};

describe('WebhookService', () => {
  describe('processInbound', () => {
    it('resolves tenant, persists inbound + reply, and sends the agent reply', async () => {
      const {
        service,
        sendText,
        resolveIdByPhoneNumberId,
        getOrCreateActive,
        appendMessages,
        processMessage,
      } = createService();

      await service.processInbound(textPayload());

      expect(resolveIdByPhoneNumberId).toHaveBeenCalledWith('pnid-123');
      expect(getOrCreateActive).toHaveBeenCalledWith(
        'agency-1',
        '5491122223333',
      );
      expect(processMessage).toHaveBeenCalledWith({
        agencyId: 'agency-1',
        conversationId: 'conv-1',
        clientPhone: '5491122223333',
        history: [],
        userText: 'Hola',
      });
      expect(sendText).toHaveBeenCalledWith('5491122223333', AGENT_REPLY);

      expect(appendMessages).toHaveBeenCalledTimes(2);
      expect(appendMessages).toHaveBeenNthCalledWith(1, expect.anything(), [
        expect.objectContaining({
          role: 'user',
          content: 'Hola',
          whatsapp_message_id: 'wamid.ABC',
        }),
      ]);
      // The assistant turn is persisted together with the tokens it cost.
      expect(appendMessages).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        [expect.objectContaining({ role: 'assistant', content: AGENT_REPLY })],
        SAMPLE_USAGE,
      );
      // The inbound user turn carries no usage.
      expect(appendMessages.mock.calls[0]).toHaveLength(2);
    });

    it('sends the generic fallback and persists it (with no usage) when the agent fails', async () => {
      const { service, sendText, appendMessages, processMessage } =
        createService();
      processMessage.mockRejectedValueOnce(new Error('anthropic down'));

      await service.processInbound(textPayload());

      expect(sendText).toHaveBeenCalledWith('5491122223333', FALLBACK_REPLY_ES);
      // Fallback turn never reached Claude, so no token totals are recorded.
      expect(appendMessages).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        [
          expect.objectContaining({
            role: 'assistant',
            content: FALLBACK_REPLY_ES,
          }),
        ],
        undefined,
      );
    });

    it('does not send or persist when the tenant cannot be resolved', async () => {
      const { service, sendText, getOrCreateActive, appendMessages } =
        createService({ agencyId: null });

      await service.processInbound(textPayload());

      expect(getOrCreateActive).not.toHaveBeenCalled();
      expect(appendMessages).not.toHaveBeenCalled();
      expect(sendText).not.toHaveBeenCalled();
    });

    it('sends the rate-limit reply and never reaches the agent when the phone is over its limit', async () => {
      const {
        service,
        sendText,
        checkAndIncrement,
        getOrCreateActive,
        appendMessages,
        processMessage,
      } = createService({ rateLimitAllowed: false });

      await service.processInbound(textPayload());

      expect(checkAndIncrement).toHaveBeenCalledWith(
        'agency-1',
        '5491122223333',
      );
      expect(sendText).toHaveBeenCalledTimes(1);
      expect(sendText).toHaveBeenCalledWith(
        '5491122223333',
        RATE_LIMIT_REPLY_ES,
      );
      expect(getOrCreateActive).not.toHaveBeenCalled();
      expect(appendMessages).not.toHaveBeenCalled();
      expect(processMessage).not.toHaveBeenCalled();
    });

    it('escalates and hands off when the conversation is at the message cap, without calling the agent', async () => {
      const {
        service,
        sendText,
        escalate,
        markEscalated,
        appendMessages,
        processMessage,
      } = createService({ messageCount: MAX_MESSAGES });

      await service.processInbound(textPayload());

      expect(escalate).toHaveBeenCalledWith(
        'agency-1',
        expect.objectContaining({ phone: '5491122223333' }),
        'conv-1',
      );
      expect(markEscalated).toHaveBeenCalledWith('conv-1', 'agency-1');
      expect(sendText).toHaveBeenCalledTimes(1);
      expect(sendText).toHaveBeenCalledWith(
        '5491122223333',
        MESSAGE_CAP_REPLY_ES,
      );
      expect(appendMessages).not.toHaveBeenCalled();
      expect(processMessage).not.toHaveBeenCalled();
    });

    it('escalates past the cap too (>= not just ==)', async () => {
      const { service, sendText } = createService({
        messageCount: MAX_MESSAGES + 5,
      });

      await service.processInbound(textPayload());

      expect(sendText).toHaveBeenCalledWith(
        '5491122223333',
        MESSAGE_CAP_REPLY_ES,
      );
    });

    it('sends the generic fallback and does not mark escalated when escalating at the cap fails', async () => {
      const { service, sendText, markEscalated } = createService({
        messageCount: MAX_MESSAGES,
        escalateFails: true,
      });

      await service.processInbound(textPayload());

      expect(sendText).toHaveBeenCalledWith('5491122223333', FALLBACK_REPLY_ES);
      expect(markEscalated).not.toHaveBeenCalled();
    });

    it('stays on the normal reply flow when under the message cap', async () => {
      const { service, sendText, processMessage } = createService({
        messageCount: MAX_MESSAGES - 1,
      });

      await service.processInbound(textPayload());

      expect(processMessage).toHaveBeenCalled();
      expect(sendText).toHaveBeenCalledWith('5491122223333', AGENT_REPLY);
    });

    it('ignores status-only payloads (no reply storm)', async () => {
      const { service, sendText, resolveIdByPhoneNumberId } = createService();
      await service.processInbound(statusPayload);
      expect(resolveIdByPhoneNumberId).not.toHaveBeenCalled();
      expect(sendText).not.toHaveBeenCalled();
    });

    it('ignores non-text messages', async () => {
      const { service, sendText, getOrCreateActive } = createService();
      await service.processInbound(textPayload('', 'image'));
      expect(getOrCreateActive).not.toHaveBeenCalled();
      expect(sendText).not.toHaveBeenCalled();
    });

    it('does not throw on a malformed payload', async () => {
      const { service } = createService();
      await expect(
        service.processInbound({} as WhatsAppWebhookPayload),
      ).resolves.toBeUndefined();
    });
  });

  describe('handleInbound (fire-and-forget)', () => {
    it('swallows downstream failures without throwing', async () => {
      const { service, getOrCreateActive } = createService();
      getOrCreateActive.mockRejectedValueOnce(new Error('db down'));

      expect(() => service.handleInbound(textPayload())).not.toThrow();
      await new Promise((resolve) => setImmediate(resolve));
      expect(getOrCreateActive).toHaveBeenCalledTimes(1);
    });
  });
});
