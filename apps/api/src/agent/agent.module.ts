import { Module } from '@nestjs/common';
import { PropertiesModule } from '../properties/properties.module';
import { LeadsModule } from '../leads/leads.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AgencyModule } from '../agency/agency.module';
import { AgentService } from './agent.service';

/**
 * Provides Luca, the Claude agent. Imports the modules whose services back the
 * tools (property search, lead save, advisor notification, agency lookup) and
 * exports AgentService so the webhook can delegate the reply (wired in Phase 5).
 */
@Module({
  imports: [PropertiesModule, LeadsModule, NotificationsModule, AgencyModule],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
