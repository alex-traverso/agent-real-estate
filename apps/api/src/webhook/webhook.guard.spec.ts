import * as crypto from 'crypto';
import {
  ExecutionContext,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebhookSignatureGuard } from './webhook.guard';

const APP_SECRET = 'test-app-secret';

function sign(body: Buffer, secret = APP_SECRET): string {
  return (
    'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex')
  );
}

function buildContext(request: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('WebhookSignatureGuard', () => {
  const rawBody = Buffer.from(JSON.stringify({ object: 'whatsapp' }));

  function guardWithSecret(secret: string | undefined) {
    const configService = {
      get: jest.fn().mockReturnValue(secret),
    } as unknown as ConfigService;
    return new WebhookSignatureGuard(configService);
  }

  function createGuard() {
    return guardWithSecret(APP_SECRET);
  }

  it('allows a request with a valid signature', () => {
    const guard = createGuard();
    const context = buildContext({
      headers: { 'x-hub-signature-256': sign(rawBody) },
      rawBody,
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects a request with an invalid signature', () => {
    const guard = createGuard();
    const context = buildContext({
      headers: { 'x-hub-signature-256': sign(rawBody, 'wrong-secret') },
      rawBody,
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejects a request whose body was tampered with', () => {
    const guard = createGuard();
    const context = buildContext({
      headers: { 'x-hub-signature-256': sign(rawBody) },
      rawBody: Buffer.from(JSON.stringify({ object: 'tampered' })),
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejects a request with no signature header', () => {
    const guard = createGuard();
    const context = buildContext({ headers: {}, rawBody });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejects a request with a signature of a different length', () => {
    const guard = createGuard();
    const context = buildContext({
      headers: { 'x-hub-signature-256': 'sha256=short' },
      rawBody,
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejects a request with no raw body', () => {
    const guard = createGuard();
    const context = buildContext({
      headers: { 'x-hub-signature-256': sign(rawBody) },
      rawBody: undefined,
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('throws a server error when META_APP_SECRET is not configured', () => {
    const guard = guardWithSecret(undefined);
    const context = buildContext({
      headers: { 'x-hub-signature-256': sign(rawBody) },
      rawBody,
    });

    expect(() => guard.canActivate(context)).toThrow(
      InternalServerErrorException,
    );
  });
});
