import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AgencyService } from './agency.service';
import { AgencyController } from './agency.controller';

/**
 * Provides agency (tenant) resolution and the onboarding/settings controller.
 * Exports AgencyService so the webhook (and the agent) can attribute inbound
 * messages to an agency. SupabaseService is global, so no import is needed
 * here; AuthModule is imported for both guards AgencyController uses —
 * SupabaseUserGuard (onboarding) and SupabaseAuthGuard (settings).
 */
@Module({
  imports: [AuthModule],
  controllers: [AgencyController],
  providers: [AgencyService],
  exports: [AgencyService],
})
export class AgencyModule {}
