import { Module } from '@nestjs/common';
import { MessagingModule } from '../messaging/messaging.module';
import { AgencyModule } from '../agency/agency.module';
import { ConversationModule } from '../conversation/conversation.module';
import { AgentModule } from '../agent/agent.module';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { EscalationModule } from '../escalation/escalation.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { WebhookController } from './webhook.controller';
import { WebhookSignatureGuard } from './webhook.guard';
import { WebhookService } from './webhook.service';

@Module({
  imports: [
    MessagingModule,
    AgencyModule,
    ConversationModule,
    AgentModule,
    RateLimitModule,
    EscalationModule,
    IdempotencyModule,
  ],
  controllers: [WebhookController],
  providers: [WebhookSignatureGuard, WebhookService],
})
export class WebhookModule {}
