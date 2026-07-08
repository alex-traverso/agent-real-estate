import { Module } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';

/**
 * Provides the outbound WhatsApp sender. Exports WhatsAppService so any
 * feature module (webhook, agent, notifications) can import it without
 * depending on the webhook feature. ConfigModule is already global, so no
 * import is needed here for ConfigService.
 */
@Module({
  providers: [WhatsAppService],
  exports: [WhatsAppService],
})
export class MessagingModule {}
