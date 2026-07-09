import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import type { Tables } from 'types';

interface SendPayload {
  from: string;
  to: string;
  subject: string;
  html: string;
}
type SendResult = {
  data: { id: string } | null;
  error: { message: string } | null;
};

// Jest hoists this above imports; the factory may only reference vars prefixed
// with `mock`. `mockSend` is typed so `.mock.calls` payloads are not `any`.
const mockSend = jest.fn<Promise<SendResult>, [SendPayload]>();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })),
}));

type Lead = Tables<'leads'>;

function leadRow(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    agency_id: 'agency-1',
    phone: '5491122334455',
    name: 'Juan',
    budget_min: null,
    budget_max: null,
    currency: null,
    operation_type: 'sale',
    preferred_zone: 'Palermo',
    rooms: 3,
    property_id: null,
    notes: null,
    status: 'new',
    created_at: '2026-07-09T00:00:00.000Z',
    ...overrides,
  };
}

function makeConfig(overrides: Record<string, string> = {}) {
  return {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'RESEND_API_KEY') {
        return 'test-key';
      }
      throw new Error(`Missing ${key}`);
    }),
    get: jest.fn((key: string) => overrides[key]),
  } as unknown as ConfigService;
}

describe('NotificationsService', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('fails fast at construction when RESEND_API_KEY is missing', () => {
    const config = {
      getOrThrow: jest.fn(() => {
        throw new Error('Missing RESEND_API_KEY');
      }),
      get: jest.fn(),
    } as unknown as ConfigService;

    expect(() => new NotificationsService(config)).toThrow(
      'Missing RESEND_API_KEY',
    );
  });

  it('sends the advisor email with from/to/subject', async () => {
    mockSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });
    const service = new NotificationsService(makeConfig());

    await service.notifyAdvisor('advisor@agency.com', leadRow());

    const [payload] = mockSend.mock.calls[0];
    expect(payload.to).toBe('advisor@agency.com');
    expect(payload.subject).toBe('Nuevo lead calificado de Luca');
    expect(payload.from).toContain('onboarding@resend.dev');
  });

  it('uses NOTIFICATIONS_FROM_EMAIL override when set', async () => {
    mockSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });
    const service = new NotificationsService(
      makeConfig({ NOTIFICATIONS_FROM_EMAIL: 'Luca <luca@myagency.com>' }),
    );

    await service.notifyAdvisor('advisor@agency.com', leadRow());

    expect(mockSend.mock.calls[0][0].from).toBe('Luca <luca@myagency.com>');
  });

  it('escapes HTML from client-supplied fields', async () => {
    mockSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });
    const service = new NotificationsService(makeConfig());

    await service.notifyAdvisor(
      'advisor@agency.com',
      leadRow({ notes: '<script>alert(1)</script>' }),
    );

    const { html } = mockSend.mock.calls[0][0];
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('swallows a Resend API error (non-blocking) and resolves', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    mockSend.mockResolvedValue({
      data: null,
      error: { message: 'rate limited' },
    });
    const service = new NotificationsService(makeConfig());

    await expect(
      service.notifyAdvisor('advisor@agency.com', leadRow()),
    ).resolves.toBeUndefined();
  });

  it('swallows a thrown send error (non-blocking) and resolves', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    mockSend.mockRejectedValue(new Error('network down'));
    const service = new NotificationsService(makeConfig());

    await expect(
      service.notifyAdvisor('advisor@agency.com', leadRow()),
    ).resolves.toBeUndefined();
  });
});
