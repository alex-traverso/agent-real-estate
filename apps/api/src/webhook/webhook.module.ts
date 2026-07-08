import { Module } from '@nestjs/common';
import { MessagingModule } from '../messaging/messaging.module';
import { AgencyModule } from '../agency/agency.module';
import { ConversationModule } from '../conversation/conversation.module';
import { WebhookController } from './webhook.controller';
import { WebhookSignatureGuard } from './webhook.guard';
import { WebhookService } from './webhook.service';

@Module({
  imports: [MessagingModule, AgencyModule, ConversationModule],
  controllers: [WebhookController],
  providers: [WebhookSignatureGuard, WebhookService],
})
export class WebhookModule {}
