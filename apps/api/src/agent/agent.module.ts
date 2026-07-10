import { Module } from '@nestjs/common';
import { PropertiesModule } from '../properties/properties.module';
import { LeadsModule } from '../leads/leads.module';
import { EscalationModule } from '../escalation/escalation.module';
import { AgentService } from './agent.service';

/**
 * Provides Luca, the Claude agent. Imports the modules whose services back the
 * tools (property search, lead save, escalation) and exports AgentService so
 * the webhook can delegate the reply.
 */
@Module({
  imports: [PropertiesModule, LeadsModule, EscalationModule],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
