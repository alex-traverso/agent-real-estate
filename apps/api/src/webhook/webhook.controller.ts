import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebhookSignatureGuard } from './webhook.guard';
import { WebhookService } from './webhook.service';
import { constantTimeEqual } from './webhook-crypto.util';
import type { WhatsAppWebhookPayload } from './types/whatsapp-webhook.types';

@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly webhookService: WebhookService,
  ) {}

  /**
   * Meta webhook verification handshake. Meta calls this once when the
   * callback URL is registered, echoing back hub.challenge if the token
   * matches. Query keys are literal (hub.mode, hub.verify_token, ...).
   */
  @Get()
  verify(@Query() query: Record<string, string>): string {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    const verifyToken = this.configService.get<string>('META_VERIFY_TOKEN');

    if (
      mode === 'subscribe' &&
      verifyToken &&
      typeof token === 'string' &&
      constantTimeEqual(verifyToken, token)
    ) {
      this.logger.log('[WebhookController] Webhook verification succeeded');
      return challenge;
    }

    this.logger.warn(
      '[WebhookController] Webhook verification failed | invalid mode or token',
    );
    throw new ForbiddenException();
  }

  /**
   * Inbound WhatsApp events. The signature is validated by the guard before
   * this runs. Handling is delegated to WebhookService as fire-and-forget so
   * Meta always gets a fast 200 and never retries (any processing error is
   * swallowed and logged there, never surfaced to Meta).
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(WebhookSignatureGuard)
  receive(@Body() payload: WhatsAppWebhookPayload): { status: string } {
    this.webhookService.handleInbound(payload);
    return { status: 'ok' };
  }
}
