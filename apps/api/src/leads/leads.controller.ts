import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { CurrentAgency } from '../auth/current-agency.decorator';
import { LeadsService } from './leads.service';
import { UpdateLeadStatusDto } from './dto/update-lead-status.dto';
import { ListLeadsQueryDto } from './dto/list-leads-query.dto';

/**
 * Admin panel read/status-update for leads. Every route requires a valid
 * Supabase Auth admin session (SupabaseAuthGuard); the tenant is always the
 * caller's own agency (CurrentAgency), never a client-supplied value
 * (CLAUDE.md: agency_id must never be derived from user input). Lead
 * creation itself only happens via the agent's save_lead tool
 * (LeadsService.saveLead) — there is no admin create endpoint.
 */
@Controller('leads')
@UseGuards(SupabaseAuthGuard)
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  list(@CurrentAgency() agencyId: string, @Query() query: ListLeadsQueryDto) {
    return this.leads.listForAdmin(
      agencyId,
      query.page ?? 1,
      query.limit ?? 20,
      query.status,
    );
  }

  @Get(':id')
  getById(@CurrentAgency() agencyId: string, @Param('id') id: string) {
    return this.leads.getByIdForAdmin(agencyId, id);
  }

  @Get(':id/conversation')
  getConversation(@CurrentAgency() agencyId: string, @Param('id') id: string) {
    return this.leads.getConversationForLead(agencyId, id);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentAgency() agencyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateLeadStatusDto,
  ) {
    return this.leads.updateStatus(agencyId, id, dto.status);
  }
}
