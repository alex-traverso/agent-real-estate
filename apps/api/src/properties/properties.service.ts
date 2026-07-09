import { Injectable, Logger } from '@nestjs/common';
import type { Tables } from 'types';
import { SupabaseService } from '../common/supabase/supabase.service';
import type { PropertyFilters } from './types/property-filters.type';

type Property = Tables<'properties'>;

const FILTER_RESULT_LIMIT = 20;
const ADDRESS_RESULT_LIMIT = 5;

/**
 * Structured property search over the `properties` table. This is agent-facing
 * (the future search tools call it), so results are limited to available
 * listings and every query is scoped by `agency_id` (multi-tenancy, per
 * CLAUDE.md). Semantic search lives in Phase 3.
 */
@Injectable()
export class PropertiesService {
  private readonly logger = new Logger(PropertiesService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Filter search by structured criteria. Only the filters present in
   * `filters` are applied; the price filter needs both `maxPrice` and
   * `currency` (cross-currency comparison is meaningless). Returns available
   * matches ordered by ascending price.
   */
  async searchByFilters(
    agencyId: string,
    filters: PropertyFilters,
  ): Promise<Property[]> {
    let query = this.supabase.client
      .from('properties')
      .select('*')
      .eq('agency_id', agencyId)
      .eq('available', true);

    if (filters.operation) {
      query = query.eq('operation', filters.operation);
    }
    if (filters.type) {
      query = query.eq('type', filters.type);
    }
    if (filters.zone) {
      query = query.ilike('zone', `%${filters.zone}%`);
    }
    if (filters.rooms !== undefined) {
      query = query.eq('rooms', filters.rooms);
    }
    if (filters.maxPrice !== undefined && filters.currency) {
      query = query
        .eq('currency', filters.currency)
        .lte('price', filters.maxPrice);
    }

    const { data, error } = await query
      .order('price', { ascending: true })
      .limit(FILTER_RESULT_LIMIT);

    if (error) {
      this.logger.error(
        `[PropertiesService] Filter search failed | agencyId: ${agencyId} | error: ${error.message}`,
      );
      throw new Error('Failed to search properties');
    }

    return data ?? [];
  }

  /**
   * Look up available properties by (partial) address, optionally narrowed by
   * zone. Returns an array; the calling tool coerces it to a single result or
   * null as needed.
   */
  async searchByAddress(
    agencyId: string,
    address: string,
    zone?: string,
  ): Promise<Property[]> {
    let query = this.supabase.client
      .from('properties')
      .select('*')
      .eq('agency_id', agencyId)
      .eq('available', true)
      .ilike('address', `%${address}%`);

    if (zone) {
      query = query.ilike('zone', `%${zone}%`);
    }

    const { data, error } = await query.limit(ADDRESS_RESULT_LIMIT);

    if (error) {
      this.logger.error(
        `[PropertiesService] Address search failed | agencyId: ${agencyId} | error: ${error.message}`,
      );
      throw new Error('Failed to search properties');
    }

    return data ?? [];
  }
}
