import { Controller, Get, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { CurrentAgency } from '../auth/current-agency.decorator';
import { StatsService } from './stats.service';

/**
 * Dashboard metrics for the admin panel. Same tenancy model as the other
 * admin-facing controllers: the agency comes from the authenticated session
 * (CurrentAgency), never from the request.
 */
@Controller('stats')
@UseGuards(SupabaseAuthGuard)
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get()
  getStats(@CurrentAgency() agencyId: string) {
    return this.stats.getAgencyStats(agencyId);
  }
}
