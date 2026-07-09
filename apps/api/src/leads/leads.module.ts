import { Module } from '@nestjs/common';
import { LeadsService } from './leads.service';

/**
 * Provides lead persistence. Exports LeadsService so the agent's `save_lead`
 * and `escalate_to_advisor` tools (Epic 6/8) can consume it. SupabaseService is
 * global, so no imports are needed.
 */
@Module({
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
