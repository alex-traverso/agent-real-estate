import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhatsAppService } from './whatsapp.service';
import { GRAPH_API_BASE_URL, GRAPH_API_VERSION } from './messaging.constants';

const API_TOKEN = 'test-api-token';
const PHONE_NUMBER_ID = 'pnid-123';

function createService(): WhatsAppService {
  const configService = {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'META_API_TOKEN') return API_TOKEN;
      if (key === 'META_PHONE_NUMBER_ID') return PHONE_NUMBER_ID;
      throw new Error(`Unexpected config key: ${key}`);
    }),
  } as unknown as ConfigService;
  return new WhatsAppService(configService);
}

describe('WhatsAppService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('POSTs to the correct URL with auth header and text payload', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          messaging_product: 'whatsapp',
          messages: [{ id: 'wamid.OUT' }],
        }),
    });
    global.fetch = fetchMock;

    const service = createService();
    const id = await service.sendText('16315551181', 'Hola');

    expect(id).toBe('wamid.OUT');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `${GRAPH_API_BASE_URL}/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}/messages`,
    );
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${API_TOKEN}`);
    expect(headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({
      messaging_product: 'whatsapp',
      to: '16315551181',
      type: 'text',
      text: { body: 'Hola' },
    });
  });

  it('strips the Argentine mobile 9 from the recipient before sending', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ messages: [{ id: 'wamid.OUT' }] }),
    });
    global.fetch = fetchMock;

    const service = createService();
    await service.sendText('5493484381803', 'Hola');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string) as { to: string };
    expect(sentBody.to).toBe('543484381803');
  });

  it('throws on a non-2xx response and does not leak the token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () =>
        Promise.resolve('{"error":{"message":"Invalid OAuth access token"}}'),
    });
    global.fetch = fetchMock;
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const service = createService();
    await expect(service.sendText('5491122223333', 'Hola')).rejects.toThrow(
      'WhatsApp send failed with status 401',
    );

    for (const call of errorSpy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(API_TOKEN);
    }
  });

  it('rethrows when the network call itself fails', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    global.fetch = fetchMock;
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const service = createService();
    await expect(service.sendText('5491122223333', 'Hola')).rejects.toThrow(
      'ECONNREFUSED',
    );
  });
});
