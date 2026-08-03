import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { SupabaseUserGuard } from '../auth/supabase-user.guard';
import { CurrentAgency } from '../auth/current-agency.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AgencyService } from './agency.service';
import { CreateAgencyDto } from './dto/create-agency.dto';
import { UpdateAgencyDto } from './dto/update-agency.dto';

/**
 * Agency onboarding and settings for the admin panel. This is the only
 * admin-facing controller whose routes don't share a single guard, because
 * they don't share a precondition:
 *
 * - `GET me` / `POST` are the onboarding pair and use SupabaseUserGuard: a
 *   user with no agency yet must still be able to check for one and create it,
 *   and SupabaseAuthGuard would reject them before the handler ran.
 * - `PATCH me` edits an agency that necessarily exists, so it uses the strict
 *   SupabaseAuthGuard and takes the tenant from @CurrentAgency() — the id is
 *   never read from the body (CLAUDE.md: agency_id must never be derived from
 *   user input).
 */
@Controller('agencies')
export class AgencyController {
  constructor(private readonly agency: AgencyService) {}

  /**
   * Returns the caller's agency, or `null` if they have none — a 200 with a
   * null body, not an error, so the admin panel can use this as a plain
   * "do I have an agency?" check to decide whether to redirect to
   * onboarding.
   */
  @Get('me')
  @UseGuards(SupabaseUserGuard)
  async getMine(@CurrentUser() userId: string) {
    return { agency: await this.agency.findByUserId(userId) };
  }

  @Post()
  @UseGuards(SupabaseUserGuard)
  create(@CurrentUser() userId: string, @Body() dto: CreateAgencyDto) {
    return this.agency.createForUser(userId, dto);
  }

  @Patch('me')
  @UseGuards(SupabaseAuthGuard)
  update(@CurrentAgency() agencyId: string, @Body() dto: UpdateAgencyDto) {
    return this.agency.updateForAgency(agencyId, dto);
  }
}
