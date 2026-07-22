import * as crypto from 'crypto';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { constantTimeEqual } from './webhook-crypto.util';

const SIGNATURE_HEADER = 'x-hub-signature-256';

/**
 * Validates Meta's X-Hub-Signature-256 on every inbound webhook POST.
 * This is the most critical security control in the system: without it,
 * anyone with the webhook URL could inject fake WhatsApp messages.
 */
@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  private readonly logger = new Logger(WebhookSignatureGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<RawBodyRequest<Request>>();

    const appSecret = this.configService.get<string>('META_APP_SECRET');
    if (!appSecret) {
      // Server misconfiguration — fail loud, never accept an unverifiable request.
      this.logger.error(
        '[WebhookSignatureGuard] META_APP_SECRET is not configured',
      );
      throw new InternalServerErrorException();
    }

    const signature = request.headers[SIGNATURE_HEADER];
    if (typeof signature !== 'string') {
      this.logger.warn(
        '[WebhookSignatureGuard] Rejected request | reason: missing signature header',
      );
      throw new ForbiddenException();
    }

    const rawBody = request.rawBody;
    if (!rawBody) {
      this.logger.warn(
        '[WebhookSignatureGuard] Rejected request | reason: missing raw body',
      );
      throw new ForbiddenException();
    }

    const expected =
      'sha256=' +
      crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');

    if (!constantTimeEqual(expected, signature)) {
      this.logger.warn(
        '[WebhookSignatureGuard] Rejected request | reason: invalid signature',
      );
      throw new ForbiddenException();
    }

    return true;
  }
}
