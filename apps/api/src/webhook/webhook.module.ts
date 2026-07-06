import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookSignatureGuard } from './webhook.guard';

@Module({
  controllers: [WebhookController],
  providers: [WebhookSignatureGuard],
})
export class WebhookModule {}
