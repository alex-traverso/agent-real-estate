import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  Database,
  Enums,
  Tables,
  TablesInsert,
  TablesUpdate,
} from 'types';
import { SupabaseService } from '../common/supabase/supabase.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { buildPropertyEmbeddingInput } from '../embeddings/embedding-input';
import type { PropertyFilters } from './types/property-filters.type';
import type { AdminPropertyListOptions } from './types/admin-property-list.type';
import type { CreatePropertyDto } from './dto/create-property.dto';
import type { UpdatePropertyDto } from './dto/update-property.dto';

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

// Fields that feed buildPropertyEmbeddingInput. An admin update only pays the
// OpenAI embedding call again if one of these actually changed — a price or
// availability edit alone doesn't affect the indexed text.
const EMBEDDING_RELEVANT_FIELDS = [
  'title',
  'description',
  'zone',
  'type',
  'operation',
  'rooms',
  'bedrooms',
  'parking',
] as const;

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
    if (filters.zones?.length) {
      // Match any of the requested neighborhoods. Each value is sanitized before it
      // goes into the PostgREST `.or` grammar, since the zones originate from
      // the client (via the agent) and could otherwise inject filter syntax.
      const zoneFilter = filters.zones
        .map((zone) => this.sanitizeFilterValue(zone))
        .filter(Boolean)
        .map((zone) => `zone.ilike.%${zone}%`)
        .join(',');
      if (zoneFilter) {
        query = query.or(zoneFilter);
      }
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

  /**
   * Returns the distinct neighborhoods (`zone`) the agency has, sorted
   * alphabetically. The agent uses this to resolve a broad region ("zona norte")
   * into the actual neighborhoods in the catalogue, applying its own geographic
   * knowledge — so no region→neighborhood map is hardcoded anywhere.
   *
   * `onlyAvailable` defaults to true, which is what the agent needs: it must
   * never offer a region whose listings are all delisted. The admin panel passes
   * false, since its zone filter has to cover unavailable properties too.
   */
  async listAvailableZones(
    agencyId: string,
    onlyAvailable = true,
  ): Promise<string[]> {
    let query = this.supabase.client
      .from('properties')
      .select('zone')
      .eq('agency_id', agencyId);

    if (onlyAvailable) {
      query = query.eq('available', true);
    }

    const { data, error } = await query;

    if (error) {
      this.logger.error(
        `[PropertiesService] Failed to list zones | agencyId: ${agencyId} | error: ${error.message}`,
      );
      throw new Error('Failed to list zones');
    }

    const zones = new Set((data ?? []).map((row) => row.zone).filter(Boolean));
    return [...zones].sort((a, b) => a.localeCompare(b));
  }

  /**
   * Admin panel listing: every property for the agency, available or not
   * (unlike the agent-facing search methods above), filtered by whatever the
   * panel's filter bar has set, sorted and paginated. `total` is the count
   * *after* filtering, so the panel can paginate the filtered result.
   */
  async listForAdmin(
    agencyId: string,
    options: AdminPropertyListOptions,
  ): Promise<{ data: Property[]; total: number }> {
    const { page, limit, sort, order } = options;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = this.supabase.client
      .from('properties')
      .select('*', { count: 'exact' })
      .eq('agency_id', agencyId);

    if (options.operation) {
      query = query.eq('operation', options.operation);
    }
    if (options.type) {
      query = query.eq('type', options.type);
    }
    if (options.available !== undefined) {
      query = query.eq('available', options.available);
    }
    if (options.zone) {
      query = query.ilike('zone', `%${options.zone}%`);
    }

    // Free text spans two columns, so it needs `.or` — and therefore the same
    // sanitization the agent-facing zone filter uses, since the term comes
    // straight from the panel's search box.
    const search = options.search
      ? this.sanitizeFilterValue(options.search)
      : '';
    if (search) {
      query = query.or(`title.ilike.%${search}%,address.ilike.%${search}%`);
    }

    const { data, error, count } = await query
      .order(sort, { ascending: order === 'asc' })
      .range(from, to);

    if (error) {
      this.logger.error(
        `[PropertiesService] Admin list failed | agencyId: ${agencyId} | error: ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to list properties');
    }

    return { data: data ?? [], total: count ?? 0 };
  }

  /**
   * Admin panel single-property lookup, including unavailable properties.
   * Throws NotFoundException if the id doesn't exist or belongs to another
   * agency — the two cases are indistinguishable to the caller by design.
   */
  async getByIdForAdmin(agencyId: string, id: string): Promise<Property> {
    const { data, error } = await this.supabase.client
      .from('properties')
      .select('*')
      .eq('agency_id', agencyId)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      this.logger.error(
        `[PropertiesService] Admin lookup failed | agencyId: ${agencyId} | error: ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to fetch property');
    }

    if (!data) {
      throw new NotFoundException('Property not found');
    }

    return data;
  }

  /**
   * Creates a property for the agency. Generates the semantic-search
   * embedding from the same template the seed uses (buildPropertyEmbeddingInput)
   * so newly created properties are searchable immediately.
   */
  async create(agencyId: string, dto: CreatePropertyDto): Promise<Property> {
    const embedding = await this.generateEmbeddingColumn(dto);

    const insert: TablesInsert<'properties'> = {
      agency_id: agencyId,
      title: dto.title,
      description: dto.description ?? null,
      zone: dto.zone,
      type: dto.type,
      operation: dto.operation,
      price: dto.price,
      currency: dto.currency,
      rooms: dto.rooms ?? null,
      bedrooms: dto.bedrooms ?? null,
      bathrooms: dto.bathrooms ?? null,
      covered_area: dto.coveredArea ?? null,
      total_area: dto.totalArea ?? null,
      hoa_fees: dto.hoaFees ?? null,
      address: dto.address ?? null,
      parking: dto.parking ?? null,
      embedding,
    };

    const { data, error } = await this.supabase.client
      .from('properties')
      .insert(insert)
      .select('*')
      .single();

    if (error || !data) {
      this.logger.error(
        `[PropertiesService] Failed to create property | agencyId: ${agencyId} | error: ${
          error?.message ?? 'no row returned'
        }`,
      );
      throw new InternalServerErrorException('Failed to create property');
    }

    return data;
  }

  /**
   * Patches a property. Re-embeds only when a field that feeds
   * buildPropertyEmbeddingInput actually changed (EMBEDDING_RELEVANT_FIELDS) —
   * a price-only edit doesn't cost an OpenAI call. Merges the patch onto the
   * current row first so the regenerated embedding reflects the full property,
   * not just the changed fields.
   */
  async update(
    agencyId: string,
    id: string,
    dto: UpdatePropertyDto,
  ): Promise<Property> {
    const current = await this.getByIdForAdmin(agencyId, id);

    // class-transformer sets every optional DTO field as an own property —
    // including `undefined` for ones the admin didn't send (TS class fields
    // under useDefineForClassFields initialize eagerly). Filtering by value
    // (not by `in`/key presence) is what actually distinguishes "sent" from
    // "absent" here.
    const patch = Object.fromEntries(
      Object.entries(dto).filter(([, value]) => value !== undefined),
    ) as Partial<CreatePropertyDto>;

    const needsReembedding = EMBEDDING_RELEVANT_FIELDS.some(
      (field) => field in patch,
    );
    const embeddableSource = {
      title: patch.title ?? current.title,
      description: patch.description ?? current.description,
      zone: patch.zone ?? current.zone,
      type: patch.type ?? current.type,
      operation: patch.operation ?? current.operation,
      rooms: patch.rooms ?? current.rooms,
      bedrooms: patch.bedrooms ?? current.bedrooms,
      parking: patch.parking ?? current.parking,
    };

    // Built field-by-field rather than spreading `patch`: DTO fields are
    // camelCase and three of them (coveredArea/totalArea/hoaFees) don't share
    // a name with their DB column, so a spread would need post-hoc renaming.
    // (properties has no updated_at column, unlike conversations/leads.)
    const update: TablesUpdate<'properties'> = {};
    if ('title' in patch) update.title = patch.title;
    if ('description' in patch) update.description = patch.description;
    if ('zone' in patch) update.zone = patch.zone;
    if ('type' in patch) update.type = patch.type;
    if ('operation' in patch) update.operation = patch.operation;
    if ('price' in patch) update.price = patch.price;
    if ('currency' in patch) update.currency = patch.currency;
    if ('rooms' in patch) update.rooms = patch.rooms;
    if ('bedrooms' in patch) update.bedrooms = patch.bedrooms;
    if ('bathrooms' in patch) update.bathrooms = patch.bathrooms;
    if ('coveredArea' in patch) update.covered_area = patch.coveredArea;
    if ('totalArea' in patch) update.total_area = patch.totalArea;
    if ('hoaFees' in patch) update.hoa_fees = patch.hoaFees;
    if ('address' in patch) update.address = patch.address;
    if ('parking' in patch) update.parking = patch.parking;

    if (needsReembedding) {
      update.embedding = await this.generateEmbeddingColumn(embeddableSource);
    }

    const { data, error } = await this.supabase.client
      .from('properties')
      .update(update)
      .eq('agency_id', agencyId)
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) {
      this.logger.error(
        `[PropertiesService] Failed to update property | agencyId: ${agencyId} | propertyId: ${id} | error: ${
          error?.message ?? 'no row returned'
        }`,
      );
      throw new InternalServerErrorException('Failed to update property');
    }

    return data;
  }

  /**
   * Toggles listing visibility without touching the embedding — availability
   * doesn't feed the semantic-search text. Confirms the property exists
   * (and belongs to the agency) first, so a genuine DB failure on the update
   * itself is never reported as a 404.
   */
  async setAvailability(
    agencyId: string,
    id: string,
    available: boolean,
  ): Promise<Property> {
    await this.getByIdForAdmin(agencyId, id);

    const { data, error } = await this.supabase.client
      .from('properties')
      .update({ available })
      .eq('agency_id', agencyId)
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) {
      this.logger.error(
        `[PropertiesService] Failed to set availability | agencyId: ${agencyId} | propertyId: ${id} | error: ${
          error?.message ?? 'no row returned'
        }`,
      );
      throw new InternalServerErrorException('Failed to set availability');
    }

    return data;
  }

  private async generateEmbeddingColumn(
    property: Parameters<typeof buildPropertyEmbeddingInput>[0],
  ): Promise<string> {
    const vector = await this.embeddings.generateEmbedding(
      buildPropertyEmbeddingInput(property),
    );
    return `[${vector.join(',')}]`;
  }

  /**
   * Strips characters that could break the PostgREST `.or` filter grammar
   * (commas, dots, parentheses, etc.), keeping letters, numbers, spaces and
   * hyphens. Applied to every value that reaches an `.or` clause — agent-supplied
   * zones and admin-supplied search terms alike — to prevent filter injection.
   */
  private sanitizeFilterValue(value: string): string {
    return value.replace(/[^\p{L}\p{N}\s-]/gu, '').trim();
  }
}
