import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { CurrentAgency } from '../auth/current-agency.decorator';
import { PropertiesService } from './properties.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { SetAvailabilityDto } from './dto/set-availability.dto';
import { ListPropertiesQueryDto } from './dto/list-properties-query.dto';

/**
 * Admin panel CRUD for properties. Every route requires a valid Supabase
 * Auth admin session (SupabaseAuthGuard); the tenant is always the caller's
 * own agency (CurrentAgency), never a client-supplied value (CLAUDE.md:
 * agency_id must never be derived from user input).
 */
@Controller('properties')
@UseGuards(SupabaseAuthGuard)
export class PropertiesController {
  constructor(private readonly properties: PropertiesService) {}

  @Get()
  list(
    @CurrentAgency() agencyId: string,
    @Query() query: ListPropertiesQueryDto,
  ) {
    return this.properties.listForAdmin(
      agencyId,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @Get(':id')
  getById(@CurrentAgency() agencyId: string, @Param('id') id: string) {
    return this.properties.getByIdForAdmin(agencyId, id);
  }

  @Post()
  create(@CurrentAgency() agencyId: string, @Body() dto: CreatePropertyDto) {
    return this.properties.create(agencyId, dto);
  }

  @Patch(':id')
  update(
    @CurrentAgency() agencyId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePropertyDto,
  ) {
    return this.properties.update(agencyId, id, dto);
  }

  @Patch(':id/availability')
  setAvailability(
    @CurrentAgency() agencyId: string,
    @Param('id') id: string,
    @Body() dto: SetAvailabilityDto,
  ) {
    return this.properties.setAvailability(agencyId, id, dto.available);
  }
}
