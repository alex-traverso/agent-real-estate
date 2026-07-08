import { Module } from '@nestjs/common';
import { MessagingModule } from '../messaging/messaging.module';
import { WebhookController } from './webhook.controller';
import { WebhookSignatureGuard } from './webhook.guard';
import { WebhookService } from './webhook.service';

@Module({
  imports: [MessagingModule],
  controllers: [WebhookController],
  providers: [WebhookSignatureGuard, WebhookService],
})
export class WebhookModule {}
