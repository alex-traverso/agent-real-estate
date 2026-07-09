import { Module } from '@nestjs/common';
import { AgencyService } from './agency.service';

/**
 * Provides agency (tenant) resolution. Exports AgencyService so the webhook
 * (and later the agent) can attribute inbound messages to an agency.
 * SupabaseService is global, so no import is needed here.
 */
@Module({
  providers: [AgencyService],
  exports: [AgencyService],
})
export class AgencyModule {}
