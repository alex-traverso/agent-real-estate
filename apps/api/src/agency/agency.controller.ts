import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { SupabaseUserGuard } from '../auth/supabase-user.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AgencyService } from './agency.service';
import { CreateAgencyDto } from './dto/create-agency.dto';

/**
 * Agency onboarding for the admin panel. Unlike every other admin-facing
 * controller, this one uses SupabaseUserGuard instead of SupabaseAuthGuard —
 * a user with no agency yet must still be able to check for one (`GET /me`)
 * and create it (`POST`); SupabaseAuthGuard would reject them before they
 * ever reached the handler (CLAUDE.md: agency_id must never be derived from
 * user input, but here there's no agency yet for the handler to derive).
 */
@Controller('agencies')
@UseGuards(SupabaseUserGuard)
export class AgencyController {
  constructor(private readonly agency: AgencyService) {}

  /**
   * Returns the caller's agency, or `null` if they have none — a 200 with a
   * null body, not an error, so the admin panel can use this as a plain
   * "do I have an agency?" check to decide whether to redirect to
   * onboarding.
   */
  @Get('me')
  async getMine(@CurrentUser() userId: string) {
    return { agency: await this.agency.findByUserId(userId) };
  }

  @Post()
  create(@CurrentUser() userId: string, @Body() dto: CreateAgencyDto) {
    return this.agency.createForUser(userId, dto);
  }
}
