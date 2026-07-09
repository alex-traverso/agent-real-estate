import { Module } from '@nestjs/common';
import { AgentService } from './agent.service';

/**
 * Provides Luca, the Claude agent. Exports AgentService so the webhook can
 * delegate the reply to it (wired in Epic 6 Phase 5). Tool-providing modules
 * (Properties, Leads, Notifications, Agency) are imported here in Phase 4.
 */
@Module({
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
