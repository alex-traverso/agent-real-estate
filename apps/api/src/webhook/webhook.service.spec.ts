import { WebhookService } from './webhook.service';
import { FALLBACK_REPLY_ES } from './webhook.constants';
import type { WhatsAppService } from '../messaging/whatsapp.service';
import type { AgencyService } from '../agency/agency.service';
import type { ConversationService } from '../conversation/conversation.service';
import type { AgentService } from '../agent/agent.service';
import type { WhatsAppWebhookPayload } from './types/whatsapp-webhook.types';

const AGENT_REPLY = 'Hola, soy Luca. ¿Buscás alquilar o comprar?';
const CONVERSATION = {
  id: 'conv-1',
  agency_id: 'agency-1',
  message_count: 0,
  messages: [],
};

function createService(opts: { agencyId?: string | null } = {}) {
  const sendText = jest.fn().mockResolvedValue('wamid.OUT');
  const resolveIdByPhoneNumberId = jest
    .fn()
    .mockResolvedValue(
      opts.agencyId === undefined ? 'agency-1' : opts.agencyId,
    );
  const getOrCreateActive = jest.fn().mockResolvedValue(CONVERSATION);
  const appendMessages = jest.fn().mockResolvedValue(CONVERSATION);
  const processMessage = jest.fn().mockResolvedValue(AGENT_REPLY);

  const whatsapp = { sendText } as unknown as WhatsAppService;
  const agencyService = {
    resolveIdByPhoneNumberId,
  } as unknown as AgencyService;
  const conversationService = {
    getOrCreateActive,
    appendMessages,
  } as unknown as ConversationService;
  const agent = { processMessage } as unknown as AgentService;

  return {
    service: new WebhookService(
      whatsapp,
      agencyService,
      conversationService,
      agent,
    ),
    sendText,
    resolveIdByPhoneNumberId,
    getOrCreateActive,
    appendMessages,
    processMessage,
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
      expect(appendMessages).toHaveBeenNthCalledWith(2, expect.anything(), [
        expect.objectContaining({ role: 'assistant', content: AGENT_REPLY }),
      ]);
    });

    it('sends the generic fallback and persists it when the agent fails', async () => {
      const { service, sendText, appendMessages, processMessage } =
        createService();
      processMessage.mockRejectedValueOnce(new Error('anthropic down'));

      await service.processInbound(textPayload());

      expect(sendText).toHaveBeenCalledWith('5491122223333', FALLBACK_REPLY_ES);
      expect(appendMessages).toHaveBeenNthCalledWith(2, expect.anything(), [
        expect.objectContaining({
          role: 'assistant',
          content: FALLBACK_REPLY_ES,
        }),
      ]);
    });

    it('does not send or persist when the tenant cannot be resolved', async () => {
      const { service, sendText, getOrCreateActive, appendMessages } =
        createService({ agencyId: null });

      await service.processInbound(textPayload());

      expect(getOrCreateActive).not.toHaveBeenCalled();
      expect(appendMessages).not.toHaveBeenCalled();
      expect(sendText).not.toHaveBeenCalled();
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
