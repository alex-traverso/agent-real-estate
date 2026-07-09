import { Injectable, Logger } from '@nestjs/common';
import type { Database, Enums, Tables } from 'types';
import { SupabaseService } from '../common/supabase/supabase.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import type { PropertyFilters } from './types/property-filters.type';

type Property = Tables<'properties'>;

/**
 * A semantic-search result row: a subset of property columns plus the cosine
 * `similarity` score. Shape is defined by the `search_properties_semantic` RPC,
 * not by the `properties` table, so it is derived from the generated types.
 */
type SemanticMatch =
  Database['public']['Functions']['search_properties_semantic']['Returns'][number];

const FILTER_RESULT_LIMIT = 20;
const ADDRESS_RESULT_LIMIT = 5;
const SEMANTIC_MATCH_COUNT = 5;
// Cosine-similarity floor for semantic matches. text-embedding-3-small scores
// relevant NL-query↔property pairs around 0.3–0.5, so the RPC's own 0.7 default
// would filter everything out. This low floor just drops unrelated noise; the
// agent surfaces the top matches by rank. Tune as the agent is evaluated.
const DEFAULT_SEMANTIC_SIMILARITY = 0.25;

/**
 * Property search over the `properties` table. This is agent-facing (the future
 * search tools call it), so results are limited to available listings and every
 * query is scoped by `agency_id` (multi-tenancy, per CLAUDE.md) — including the
 * semantic path, where the tenant is enforced through the RPC's filter argument.
 */
@Injectable()
export class PropertiesService {
  private readonly logger = new Logger(PropertiesService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly embeddings: EmbeddingsService,
  ) {}

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

  /**
   * Semantic search for a free-text description ("algo tranquilo con jardín").
   * Embeds the query and delegates ranking to the `search_properties_semantic`
   * pgvector RPC, which already filters by tenant, operation and availability
   * and orders by cosine similarity. Returns the top matches with their scores.
   */
  async searchSemantic(
    agencyId: string,
    queryText: string,
    operation: Enums<'operation_type'>,
    matchCount: number = SEMANTIC_MATCH_COUNT,
    minSimilarity: number = DEFAULT_SEMANTIC_SIMILARITY,
  ): Promise<SemanticMatch[]> {
    const vector = await this.embeddings.generateEmbedding(queryText);
    // pgvector expects the literal `[v1,v2,...]` string form over the RPC.
    const queryEmbedding = `[${vector.join(',')}]`;

    const { data, error } = await this.supabase.client.rpc(
      'search_properties_semantic',
      {
        query_embedding: queryEmbedding,
        agency_id_filter: agencyId,
        operation_filter: operation,
        match_count: matchCount,
        similarity_threshold: minSimilarity,
      },
    );

    if (error) {
      this.logger.error(
        `[PropertiesService] Semantic search failed | agencyId: ${agencyId} | error: ${error.message}`,
      );
      throw new Error('Failed to search properties');
    }

    return data ?? [];
  }
}
