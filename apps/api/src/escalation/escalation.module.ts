import { Module } from '@nestjs/common';
import { LeadsModule } from '../leads/leads.module';
import { AgencyModule } from '../agency/agency.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EscalationService } from './escalation.service';

/**
 * Provides the shared escalation path (save lead + notify advisor). Exports
 * EscalationService so both AgentModule (escalate_to_advisor tool) and
 * WebhookModule (50-message-cap handoff) can consume it.
 */
@Module({
  imports: [LeadsModule, AgencyModule, NotificationsModule],
  providers: [EscalationService],
  exports: [EscalationService],
})
export class EscalationModule {}
