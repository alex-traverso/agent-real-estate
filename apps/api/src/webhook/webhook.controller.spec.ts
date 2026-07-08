import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebhookController } from './webhook.controller';
import type { WebhookService } from './webhook.service';
import type { WhatsAppWebhookPayload } from './types/whatsapp-webhook.types';

const VERIFY_TOKEN = 'test-verify-token';

function createController(verifyToken: string | undefined = VERIFY_TOKEN) {
  const configService = {
    get: jest.fn().mockReturnValue(verifyToken),
  } as unknown as ConfigService;
  const handleInbound = jest.fn();
  const webhookService = { handleInbound } as unknown as WebhookService;
  return {
    controller: new WebhookController(configService, webhookService),
    handleInbound,
  };
}

describe('WebhookController', () => {
  describe('GET /webhook (verification)', () => {
    it('echoes the challenge when mode and token are valid', () => {
      const { controller } = createController();
      const result = controller.verify({
        'hub.mode': 'subscribe',
        'hub.verify_token': VERIFY_TOKEN,
        'hub.challenge': '1234567890',
      });

      expect(result).toBe('1234567890');
    });

    it('rejects when the verify token is wrong', () => {
      const { controller } = createController();
      expect(() =>
        controller.verify({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'wrong-token',
          'hub.challenge': '1234567890',
        }),
      ).toThrow(ForbiddenException);
    });

    it('rejects when the mode is not subscribe', () => {
      const { controller } = createController();
      expect(() =>
        controller.verify({
          'hub.mode': 'unsubscribe',
          'hub.verify_token': VERIFY_TOKEN,
          'hub.challenge': '1234567890',
        }),
      ).toThrow(ForbiddenException);
    });
  });

  describe('POST /webhook (receive)', () => {
    const textPayload: WhatsAppWebhookPayload = {
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
                contacts: [
                  { profile: { name: 'Juan' }, wa_id: '5491122223333' },
                ],
                messages: [
                  {
                    from: '5491122223333',
                    id: 'wamid.ABC',
                    timestamp: '1700000000',
                    type: 'text',
                    text: { body: 'Hola, busco un depto en Palermo' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    it('returns 200 ok and delegates handling to WebhookService', () => {
      const { controller, handleInbound } = createController();
      expect(controller.receive(textPayload)).toEqual({ status: 'ok' });
      expect(handleInbound).toHaveBeenCalledTimes(1);
      expect(handleInbound).toHaveBeenCalledWith(textPayload);
    });

    it('returns 200 ok for a malformed payload without throwing', () => {
      const { controller } = createController();
      const malformed = {} as WhatsAppWebhookPayload;
      expect(controller.receive(malformed)).toEqual({ status: 'ok' });
    });
  });
});
