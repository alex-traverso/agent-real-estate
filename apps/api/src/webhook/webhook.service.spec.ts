import { WebhookService } from './webhook.service';
import { PLACEHOLDER_REPLY_ES } from './webhook.constants';
import type { WhatsAppService } from '../messaging/whatsapp.service';
import type { WhatsAppWebhookPayload } from './types/whatsapp-webhook.types';

function createService(
  sendText: jest.Mock = jest.fn().mockResolvedValue('wamid.OUT'),
) {
  const whatsapp = { sendText } as unknown as WhatsAppService;
  return { service: new WebhookService(whatsapp), sendText };
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
    it('replies to a text message with the placeholder', async () => {
      const { service, sendText } = createService();
      await service.processInbound(textPayload());

      expect(sendText).toHaveBeenCalledTimes(1);
      expect(sendText).toHaveBeenCalledWith(
        '5491122223333',
        PLACEHOLDER_REPLY_ES,
      );
    });

    it('does not reply to a status-only payload (no reply storm)', async () => {
      const { service, sendText } = createService();
      await service.processInbound(statusPayload);
      expect(sendText).not.toHaveBeenCalled();
    });

    it('does not reply to a non-text message', async () => {
      const { service, sendText } = createService();
      await service.processInbound(textPayload('', 'image'));
      expect(sendText).not.toHaveBeenCalled();
    });

    it('does not throw on a malformed payload', async () => {
      const { service, sendText } = createService();
      await expect(
        service.processInbound({} as WhatsAppWebhookPayload),
      ).resolves.toBeUndefined();
      expect(sendText).not.toHaveBeenCalled();
    });
  });

  describe('handleInbound (fire-and-forget)', () => {
    it('returns void synchronously without throwing', () => {
      const { service } = createService();
      expect(service.handleInbound(textPayload())).toBeUndefined();
    });

    it('swallows send failures without throwing', async () => {
      const sendText = jest.fn().mockRejectedValue(new Error('Meta down'));
      const { service } = createService(sendText);

      expect(() => service.handleInbound(textPayload())).not.toThrow();
      // Let the fire-and-forget promise (and its .catch) settle.
      await new Promise((resolve) => setImmediate(resolve));
      expect(sendText).toHaveBeenCalledTimes(1);
    });
  });
});
