import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';

/**
 * Provides lead persistence and the admin read/status-update controller.
 * Exports LeadsService so the agent's `save_lead` and `escalate_to_advisor`
 * tools (Epic 6/8) can consume it. SupabaseService is global; AuthModule is
 * imported for SupabaseAuthGuard.
 */
@Module({
  imports: [AuthModule],
  controllers: [LeadsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
