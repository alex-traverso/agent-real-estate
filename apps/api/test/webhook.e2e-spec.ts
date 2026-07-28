import { createHmac } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { WhatsAppService } from '../src/messaging/whatsapp.service';
import { AgencyService } from '../src/agency/agency.service';
import { ConversationService } from '../src/conversation/conversation.service';
import { AgentService } from '../src/agent/agent.service';
import { RateLimitService } from '../src/rate-limit/rate-limit.service';
import { EscalationService } from '../src/escalation/escalation.service';
import { IdempotencyService } from '../src/idempotency/idempotency.service';
import { MAX_MESSAGES } from '../src/conversation/conversation.constants';
import {
  FALLBACK_REPLY_ES,
  MESSAGE_CAP_REPLY_ES,
  RATE_LIMIT_REPLY_ES,
} from '../src/webhook/webhook.constants';
import type { StoredMessage } from '../src/conversation/types/stored-message.type';
import type { TokenUsage } from '../src/conversation/types/token-usage.type';
import type { WhatsAppWebhookPayload } from '../src/webhook/types/whatsapp-webhook.types';

/**
 * End-to-end test for the inbound WhatsApp webhook. It drives a real HTTP
 * request through the full Nest stack — WebhookSignatureGuard, controller,
 * raw-body handling and WebhookService orchestration — and replaces only the
 * network-touching boundary services (Supabase-backed data services, Claude,
 * the Meta sender, Resend) with in-memory fakes. This exercises the wiring the
 * per-service unit specs cannot: signature validation over the raw body, the
 * fire-and-forget 200, and the ordered flow signature → tenant → idempotency →
 * rate limit → conversation → agent → reply.
 */

const AGENCY_ID = 'agency-e2e';
const KNOWN_PNID = 'pnid-known';
const UNKNOWN_PNID = 'pnid-unknown';
const CLIENT_PHONE = '5491133334444';
const AGENT_REPLY = 'Hola, soy Luca. ¿Buscás alquilar o comprar?';
const SAMPLE_USAGE: TokenUsage = {
  inputTokens: 100,
  outputTokens: 20,
  cacheCreationTokens: 3000,
  cacheReadTokens: 500,
};

// Set by test/setup-e2e.ts before this file loads; the guard verifies against it.
const META_APP_SECRET = process.env.META_APP_SECRET as string;

interface FakeConversation {
  id: string;
  agency_id: string;
  phone: string;
  messages: StoredMessage[];
  message_count: number;
}

interface BootOptions {
  agentThrows?: boolean;
  seedMessageCount?: number;
}

/**
 * Boots the real AppModule with the seven WebhookService dependencies replaced
 * by in-memory fakes. Returns the app plus the jest.fn spies so tests can assert
 * on what the orchestration did. State (idempotency set, rate-limit counter,
 * conversation store) lives inside the fakes, so a single app can be driven
 * through a multi-message scenario.
 */
async function bootApp(options: BootOptions = {}) {
  const sendText = jest.fn().mockResolvedValue('wamid.OUT');

  const resolveIdByPhoneNumberId = jest.fn((phoneNumberId: string) =>
    Promise.resolve(phoneNumberId === KNOWN_PNID ? AGENCY_ID : null),
  );

  const seenMessages = new Set<string>();
  const checkAndMark = jest.fn((agencyId: string, messageId: string) => {
    const key = `${agencyId}:${messageId}`;
    if (seenMessages.has(key)) {
      return Promise.resolve(false);
    }
    seenMessages.add(key);
    return Promise.resolve(true);
  });

  const counts = new Map<string, number>();
  const checkAndIncrement = jest.fn((_agencyId: string, phone: string) => {
    const next = (counts.get(phone) ?? 0) + 1;
    counts.set(phone, next);
    return Promise.resolve(next <= 20);
  });

  const conversations = new Map<string, FakeConversation>();
  const convKey = (agencyId: string, phone: string) => `${agencyId}:${phone}`;
  if (options.seedMessageCount != null) {
    conversations.set(convKey(AGENCY_ID, CLIENT_PHONE), {
      id: 'conv-seed',
      agency_id: AGENCY_ID,
      phone: CLIENT_PHONE,
      messages: [],
      message_count: options.seedMessageCount,
    });
  }
  const getOrCreateActive = jest.fn((agencyId: string, phone: string) => {
    const key = convKey(agencyId, phone);
    let conversation = conversations.get(key);
    if (!conversation) {
      conversation = {
        id: `conv-${conversations.size + 1}`,
        agency_id: agencyId,
        phone,
        messages: [],
        message_count: 0,
      };
      conversations.set(key, conversation);
    }
    return Promise.resolve(conversation);
  });
  const appendMessages = jest.fn(
    (conversation: FakeConversation, newMessages: StoredMessage[]) => {
      conversation.messages = [...conversation.messages, ...newMessages];
      conversation.message_count += newMessages.length;
      return Promise.resolve(conversation);
    },
  );
  const markEscalated = jest.fn().mockResolvedValue(undefined);

  const processMessage = options.agentThrows
    ? jest.fn().mockRejectedValue(new Error('anthropic down'))
    : jest.fn().mockResolvedValue({ reply: AGENT_REPLY, usage: SAMPLE_USAGE });

  const escalate = jest.fn().mockResolvedValue({ id: 'lead-1' });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(WhatsAppService)
    .useValue({ sendText })
    .overrideProvider(AgencyService)
    .useValue({ resolveIdByPhoneNumberId })
    .overrideProvider(IdempotencyService)
    .useValue({ checkAndMark })
    .overrideProvider(RateLimitService)
    .useValue({ checkAndIncrement })
    .overrideProvider(ConversationService)
    .useValue({ getOrCreateActive, appendMessages, markEscalated })
    .overrideProvider(AgentService)
    .useValue({ processMessage })
    .overrideProvider(EscalationService)
    .useValue({ escalate })
    .compile();

  // rawBody + the same ValidationPipe as main.ts, so the guard and pipe behave
  // exactly as in production.
  const app = moduleRef.createNestApplication<INestApplication<App>>({
    rawBody: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();

  return {
    app,
    spies: {
      sendText,
      resolveIdByPhoneNumberId,
      checkAndMark,
      checkAndIncrement,
      getOrCreateActive,
      appendMessages,
      markEscalated,
      processMessage,
      escalate,
    },
  };
}

function sign(rawBody: string): string {
  const digest = createHmac('sha256', META_APP_SECRET)
    .update(rawBody)
    .digest('hex');
  return `sha256=${digest}`;
}

interface MessageOptions {
  body?: string;
  wamid?: string;
  from?: string;
  phoneNumberId?: string;
  type?: string;
}

function textPayload(options: MessageOptions = {}): WhatsAppWebhookPayload {
  const type = options.type ?? 'text';
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
                phone_number_id: options.phoneNumberId ?? KNOWN_PNID,
              },
              messages: [
                {
                  from: options.from ?? CLIENT_PHONE,
                  id: options.wamid ?? 'wamid.ABC',
                  timestamp: '1700000000',
                  type,
                  ...(type === 'text'
                    ? { text: { body: options.body ?? 'Hola' } }
                    : {}),
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function statusPayload(): WhatsAppWebhookPayload {
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
                phone_number_id: KNOWN_PNID,
              },
              statuses: [
                {
                  id: 'wamid.ABC',
                  status: 'delivered',
                  timestamp: '1700000000',
                  recipient_id: CLIENT_PHONE,
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

/**
 * The controller replies 200 and processes the webhook fire-and-forget, so the
 * side effects land after the response. Poll until they do (positive assertions).
 */
async function waitFor(
  predicate: () => boolean,
  timeoutMs = 1500,
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor: condition not met within timeout');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

// Give the fire-and-forget work time to run before asserting it did NOT happen.
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 60));
}

type Spies = Awaited<ReturnType<typeof bootApp>>['spies'];

function sentWith(spies: Spies, body: string): boolean {
  return spies.sendText.mock.calls.some(
    (call: [string, string]) => call[1] === body,
  );
}

describe('Webhook (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let spies: Spies;

  async function boot(options?: BootOptions): Promise<void> {
    const booted = await bootApp(options);
    app = booted.app;
    spies = booted.spies;
  }

  function post(payload: WhatsAppWebhookPayload, signature?: string | null) {
    const raw = JSON.stringify(payload);
    const req = request(app!.getHttpServer())
      .post('/webhook')
      .set('Content-Type', 'application/json');
    // `undefined` → sign it correctly; `null` → send no header; string → verbatim.
    const header = signature === undefined ? sign(raw) : signature;
    if (header !== null) {
      req.set('x-hub-signature-256', header);
    }
    return req.send(raw);
  }

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('accepts a valid signed message and replies with the agent output', async () => {
    await boot();

    await post(textPayload()).expect(200).expect({ status: 'ok' });

    await waitFor(() => spies.sendText.mock.calls.length > 0);
    expect(spies.resolveIdByPhoneNumberId).toHaveBeenCalledWith(KNOWN_PNID);
    expect(spies.checkAndMark).toHaveBeenCalledWith(AGENCY_ID, 'wamid.ABC');
    expect(spies.processMessage).toHaveBeenCalledTimes(1);
    expect(spies.sendText).toHaveBeenCalledWith(CLIENT_PHONE, AGENT_REPLY);
  });

  it('rejects a request with no signature header (403) and processes nothing', async () => {
    await boot();

    await post(textPayload(), null).expect(403);

    await flush();
    expect(spies.resolveIdByPhoneNumberId).not.toHaveBeenCalled();
    expect(spies.processMessage).not.toHaveBeenCalled();
    expect(spies.sendText).not.toHaveBeenCalled();
  });

  it('rejects a request with an invalid signature (403) and processes nothing', async () => {
    await boot();

    await post(textPayload(), 'sha256=deadbeef').expect(403);

    await flush();
    expect(spies.processMessage).not.toHaveBeenCalled();
    expect(spies.sendText).not.toHaveBeenCalled();
  });

  it('drops a message from an unknown phone_number_id without replying', async () => {
    await boot();

    await post(textPayload({ phoneNumberId: UNKNOWN_PNID }))
      .expect(200)
      .expect({ status: 'ok' });

    await flush();
    expect(spies.resolveIdByPhoneNumberId).toHaveBeenCalledWith(UNKNOWN_PNID);
    expect(spies.getOrCreateActive).not.toHaveBeenCalled();
    expect(spies.processMessage).not.toHaveBeenCalled();
    expect(spies.sendText).not.toHaveBeenCalled();
  });

  it('deduplicates a Meta redelivery (same message id): replies once, never twice', async () => {
    await boot();

    await post(textPayload({ wamid: 'wamid.DUP' })).expect(200);
    await waitFor(() => spies.processMessage.mock.calls.length === 1);

    await post(textPayload({ wamid: 'wamid.DUP' })).expect(200);
    await flush();

    expect(spies.processMessage).toHaveBeenCalledTimes(1);
    expect(spies.sendText).toHaveBeenCalledTimes(1);
    expect(spies.sendText).toHaveBeenCalledWith(CLIENT_PHONE, AGENT_REPLY);
  });

  it('sends the rate-limit reply on the 21st message and never calls the agent for it', async () => {
    await boot();

    for (let i = 1; i <= 20; i++) {
      await post(textPayload({ wamid: `wamid.rl-${i}` })).expect(200);
    }
    await waitFor(() => spies.processMessage.mock.calls.length === 20);

    await post(textPayload({ wamid: 'wamid.rl-21' })).expect(200);
    await waitFor(() => sentWith(spies, RATE_LIMIT_REPLY_ES));

    // The blocked message never reached the agent — still only 20 calls.
    expect(spies.processMessage).toHaveBeenCalledTimes(20);
  });

  it('escalates and hands off when the conversation is at the message cap', async () => {
    await boot({ seedMessageCount: MAX_MESSAGES });

    await post(textPayload()).expect(200);

    await waitFor(() => spies.escalate.mock.calls.length > 0);
    expect(spies.markEscalated).toHaveBeenCalled();
    expect(spies.sendText).toHaveBeenCalledWith(
      CLIENT_PHONE,
      MESSAGE_CAP_REPLY_ES,
    );
    expect(spies.processMessage).not.toHaveBeenCalled();
  });

  it('sends the generic fallback (never an internal error) when the agent fails', async () => {
    await boot({ agentThrows: true });

    await post(textPayload()).expect(200);

    await waitFor(() => sentWith(spies, FALLBACK_REPLY_ES));
    expect(spies.sendText).toHaveBeenCalledTimes(1);
  });

  it('ignores a non-text message (no tenant resolution, no reply)', async () => {
    await boot();

    await post(textPayload({ type: 'image' })).expect(200);

    await flush();
    expect(spies.resolveIdByPhoneNumberId).not.toHaveBeenCalled();
    expect(spies.sendText).not.toHaveBeenCalled();
  });

  it('ignores a status-only payload (delivery receipt, no reply storm)', async () => {
    await boot();

    await post(statusPayload()).expect(200);

    await flush();
    expect(spies.resolveIdByPhoneNumberId).not.toHaveBeenCalled();
    expect(spies.sendText).not.toHaveBeenCalled();
  });
});
