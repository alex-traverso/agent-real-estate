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
import { isTextMessage } from './types/whatsapp-webhook.types';
import type {
  WhatsAppMessage,
  WhatsAppWebhookPayload,
} from './types/whatsapp-webhook.types';

@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly configService: ConfigService) {}

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

    if (mode === 'subscribe' && verifyToken && token === verifyToken) {
      this.logger.log('[WebhookController] Webhook verification succeeded');
      return challenge;
    }

    this.logger.warn(
      '[WebhookController] Webhook verification failed | invalid mode or token',
    );
    throw new ForbiddenException();
  }

  /**
   * Inbound WhatsApp events. The signature is validated by the guard
   * before this runs. Always returns 200 so Meta does not retry — any
   * processing error is swallowed and logged, never surfaced to Meta.
   * Actual message handling (conversation -> agent) is not built yet.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(WebhookSignatureGuard)
  receive(@Body() payload: WhatsAppWebhookPayload): { status: string } {
    try {
      for (const message of this.extractMessages(payload)) {
        this.logMessage(message);
      }
    } catch (error) {
      this.logger.error(
        `[WebhookController] Failed to process webhook payload | error: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }

    // TODO(conversation/agent): load/create conversation, run Luca, reply.
    return { status: 'ok' };
  }

  private extractMessages(payload: WhatsAppWebhookPayload): WhatsAppMessage[] {
    const messages: WhatsAppMessage[] = [];
    for (const entry of payload?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        for (const message of change?.value?.messages ?? []) {
          messages.push(message);
        }
      }
    }
    return messages;
  }

  private logMessage(message: WhatsAppMessage): void {
    // Safe in every environment: masked phone + message id/type only.
    this.logger.log(
      `[WebhookController] Message received | from: ${this.maskPhone(
        message.from,
      )} | id: ${message.id} | type: ${message.type}`,
    );

    // Dev-only: show the full sender and body so the Meta connection can
    // be verified locally. Never emitted in production (SECURITY.md).
    if (process.env.NODE_ENV !== 'production') {
      const body = isTextMessage(message) ? message.text.body : '(non-text)';
      this.logger.debug(
        `[WebhookController] (dev) from: ${message.from} | body: ${body}`,
      );
    }
  }

  private maskPhone(phone: string): string {
    if (!phone) {
      return 'unknown';
    }
    const last4 = phone.slice(-4);
    return `***${last4}`;
  }
}
