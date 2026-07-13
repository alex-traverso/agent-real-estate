import { Logger } from '@nestjs/common';
import { PropertiesService } from './properties.service';
import type { SupabaseService } from '../common/supabase/supabase.service';
import type { EmbeddingsService } from '../embeddings/embeddings.service';

type Result = { data: unknown; error: { message: string } | null };

/**
 * Builds a PropertiesService over mocks. The Supabase client mock is chainable:
 * every builder method returns the same builder. Structured queries are awaited
 * directly (list results, no `.single()`), so the builder is thenable and
 * resolves the next queued result; `rpc` (semantic search) resolves it too.
 * EmbeddingsService is mocked to return a fixed vector.
 */
function makeService(results: Result[], vector: number[] = [0.1, 0.2, 0.3]) {
  const builder: Record<string, jest.Mock> & { then?: unknown } = {};
  for (const method of [
    'select',
    'eq',
    'ilike',
    'or',
    'order',
    'limit',
    'lte',
  ]) {
    builder[method] = jest.fn(() => builder);
  }
  (builder as { then: unknown }).then = (resolve: (v: Result) => unknown) =>
    resolve(results.shift() ?? { data: [], error: null });

  const from = jest.fn(() => builder);
  const rpc = jest.fn(() =>
    Promise.resolve(results.shift() ?? { data: [], error: null }),
  );
  const supabase = {
    client: { from, rpc },
  } as unknown as SupabaseService;

  const generateEmbedding = jest.fn().mockResolvedValue(vector);
  const embeddings = { generateEmbedding } as unknown as EmbeddingsService;

  const service = new PropertiesService(supabase, embeddings);
  return { service, builder, from, rpc, generateEmbedding };
}

function propertyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prop-1',
    agency_id: 'agency-1',
    title: 'Depto luminoso',
    description: 'Luminoso y amplio',
    type: 'apartment',
    operation: 'sale',
    price: 100000,
    currency: 'USD',
    zone: 'Palermo',
    address: 'Av. Santa Fe 4200',
    rooms: 3,
    bedrooms: 2,
    parking: true,
    available: true,
    ...overrides,
  };
}

type AdminResult = {
  data: unknown;
  error: { message: string } | null;
  count?: number | null;
};

/**
 * Builder mock for the admin CRUD methods: same chainable style as
 * makeService above, but the terminal call is single()/maybeSingle() instead
 * of the builder itself being thenable — every terminal call pops the next
 * queued result.
 */
function makeAdminService(
  results: AdminResult[],
  vector: number[] = [0.1, 0.2, 0.3],
) {
  const builder: Record<string, jest.Mock> = {};
  for (const method of ['select', 'eq', 'order', 'insert', 'update']) {
    builder[method] = jest.fn(() => builder);
  }
  const pop = () => results.shift() ?? { data: null, error: null };
  // range() is the terminal call for listForAdmin (awaited directly, no
  // single()/maybeSingle() after it), unlike the other admin methods.
  builder.range = jest.fn(() => Promise.resolve(pop()));
  builder.maybeSingle = jest.fn(() => Promise.resolve(pop()));
  builder.single = jest.fn(() => Promise.resolve(pop()));

  const from = jest.fn(() => builder);
  const supabase = { client: { from } } as unknown as SupabaseService;

  const generateEmbedding = jest.fn().mockResolvedValue(vector);
  const embeddings = { generateEmbedding } as unknown as EmbeddingsService;

  const service = new PropertiesService(supabase, embeddings);
  return { service, builder, from, generateEmbedding };
}

const createDto = {
  title: 'Depto luminoso',
  description: 'Luminoso y amplio',
  zone: 'Palermo',
  type: 'apartment' as const,
  operation: 'sale' as const,
  price: 100000,
  currency: 'USD' as const,
  rooms: 3,
  bedrooms: 2,
  parking: true,
};

describe('PropertiesService', () => {
  afterEach(() => jest.restoreAllMocks());

  describe('searchByFilters', () => {
    it('always scopes by agency_id + available and returns rows', async () => {
      const rows = [propertyRow()];
      const { service, builder, from } = makeService([
        { data: rows, error: null },
      ]);

      const result = await service.searchByFilters('agency-1', {});

      expect(result).toEqual(rows);
      expect(from).toHaveBeenCalledWith('properties');
      expect(builder.eq).toHaveBeenCalledWith('agency_id', 'agency-1');
      expect(builder.eq).toHaveBeenCalledWith('available', true);
      expect(builder.order).toHaveBeenCalledWith('price', { ascending: true });
      expect(builder.limit).toHaveBeenCalledWith(20);
    });

    it('applies each optional filter only when present', async () => {
      const { service, builder } = makeService([{ data: [], error: null }]);

      await service.searchByFilters('agency-1', {
        operation: 'rent',
        type: 'apartment',
        zones: ['Palermo'],
        rooms: 3,
      });

      expect(builder.eq).toHaveBeenCalledWith('operation', 'rent');
      expect(builder.eq).toHaveBeenCalledWith('type', 'apartment');
      expect(builder.or).toHaveBeenCalledWith('zone.ilike.%Palermo%');
      expect(builder.eq).toHaveBeenCalledWith('rooms', 3);
    });

    it('matches any of multiple zones via a sanitized or() filter', async () => {
      const { service, builder } = makeService([{ data: [], error: null }]);

      await service.searchByFilters('agency-1', {
        zones: ['San Isidro', 'Nordelta'],
      });

      expect(builder.or).toHaveBeenCalledWith(
        'zone.ilike.%San Isidro%,zone.ilike.%Nordelta%',
      );
    });

    it('strips filter-grammar characters from zone values', async () => {
      const { service, builder } = makeService([{ data: [], error: null }]);

      await service.searchByFilters('agency-1', {
        zones: ['Palermo,zone.eq.x)'],
      });

      expect(builder.or).toHaveBeenCalledWith('zone.ilike.%Palermozoneeqx%');
    });

    it('does not apply absent filters', async () => {
      const { service, builder } = makeService([{ data: [], error: null }]);

      await service.searchByFilters('agency-1', {});

      expect(builder.eq).not.toHaveBeenCalledWith(
        'operation',
        expect.anything(),
      );
      expect(builder.eq).not.toHaveBeenCalledWith('type', expect.anything());
      expect(builder.ilike).not.toHaveBeenCalled();
      expect(builder.or).not.toHaveBeenCalled();
      expect(builder.lte).not.toHaveBeenCalled();
    });

    it('applies the price filter only when both maxPrice and currency are given', async () => {
      const { service, builder } = makeService([{ data: [], error: null }]);

      await service.searchByFilters('agency-1', {
        maxPrice: 200000,
        currency: 'USD',
      });

      expect(builder.eq).toHaveBeenCalledWith('currency', 'USD');
      expect(builder.lte).toHaveBeenCalledWith('price', 200000);
    });

    it('skips the price filter when currency is missing', async () => {
      const { service, builder } = makeService([{ data: [], error: null }]);

      await service.searchByFilters('agency-1', { maxPrice: 200000 });

      expect(builder.lte).not.toHaveBeenCalled();
      expect(builder.eq).not.toHaveBeenCalledWith(
        'currency',
        expect.anything(),
      );
    });

    it('returns an empty array when there are no matches', async () => {
      const { service } = makeService([{ data: [], error: null }]);

      await expect(service.searchByFilters('agency-1', {})).resolves.toEqual(
        [],
      );
    });

    it('throws a generic error when the query fails', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { service } = makeService([
        { data: null, error: { message: 'db down' } },
      ]);

      await expect(service.searchByFilters('agency-1', {})).rejects.toThrow(
        'Failed to search properties',
      );
    });
  });

  describe('searchByAddress', () => {
    it('matches on partial address scoped by agency_id + available', async () => {
      const rows = [propertyRow()];
      const { service, builder } = makeService([{ data: rows, error: null }]);

      const result = await service.searchByAddress('agency-1', 'Santa Fe');

      expect(result).toEqual(rows);
      expect(builder.eq).toHaveBeenCalledWith('agency_id', 'agency-1');
      expect(builder.eq).toHaveBeenCalledWith('available', true);
      expect(builder.ilike).toHaveBeenCalledWith('address', '%Santa Fe%');
      expect(builder.limit).toHaveBeenCalledWith(5);
    });

    it('narrows by zone when provided', async () => {
      const { service, builder } = makeService([{ data: [], error: null }]);

      await service.searchByAddress('agency-1', 'Santa Fe', 'Palermo');

      expect(builder.ilike).toHaveBeenCalledWith('address', '%Santa Fe%');
      expect(builder.ilike).toHaveBeenCalledWith('zone', '%Palermo%');
    });

    it('returns an empty array on no match', async () => {
      const { service } = makeService([{ data: [], error: null }]);

      await expect(
        service.searchByAddress('agency-1', 'Nowhere'),
      ).resolves.toEqual([]);
    });

    it('throws a generic error when the query fails', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { service } = makeService([
        { data: null, error: { message: 'db down' } },
      ]);

      await expect(
        service.searchByAddress('agency-1', 'Santa Fe'),
      ).rejects.toThrow('Failed to search properties');
    });
  });

  describe('searchSemantic', () => {
    it('embeds the query and calls the RPC with tenant, operation and count', async () => {
      const rows = [{ ...propertyRow(), similarity: 0.91 }];
      const { service, rpc, generateEmbedding } = makeService([
        { data: rows, error: null },
      ]);

      const result = await service.searchSemantic(
        'agency-1',
        'algo tranquilo con jardín',
        'sale',
      );

      expect(result).toEqual(rows);
      expect(generateEmbedding).toHaveBeenCalledWith(
        'algo tranquilo con jardín',
      );
      expect(rpc).toHaveBeenCalledWith('search_properties_semantic', {
        query_embedding: '[0.1,0.2,0.3]',
        agency_id_filter: 'agency-1',
        operation_filter: 'sale',
        match_count: 5,
        similarity_threshold: 0.25,
      });
    });

    it('forwards custom matchCount and minSimilarity', async () => {
      const { service, rpc } = makeService([{ data: [], error: null }]);

      await service.searchSemantic('agency-1', 'monoambiente', 'rent', 3, 0.4);

      expect(rpc).toHaveBeenCalledWith(
        'search_properties_semantic',
        expect.objectContaining({
          operation_filter: 'rent',
          match_count: 3,
          similarity_threshold: 0.4,
        }),
      );
    });

    it('returns an empty array when there are no matches', async () => {
      const { service } = makeService([{ data: [], error: null }]);

      await expect(
        service.searchSemantic('agency-1', 'x', 'sale'),
      ).resolves.toEqual([]);
    });

    it('throws a generic error when the RPC fails', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { service } = makeService([
        { data: null, error: { message: 'rpc down' } },
      ]);

      await expect(
        service.searchSemantic('agency-1', 'x', 'sale'),
      ).rejects.toThrow('Failed to search properties');
    });
  });

  describe('listAvailableZones', () => {
    it('returns distinct zones sorted, scoped by agency_id + available', async () => {
      const { service, builder, from } = makeService([
        {
          data: [
            { zone: 'Palermo' },
            { zone: 'Nordelta' },
            { zone: 'Palermo' },
          ],
          error: null,
        },
      ]);

      const zones = await service.listAvailableZones('agency-1');

      expect(zones).toEqual(['Nordelta', 'Palermo']);
      expect(from).toHaveBeenCalledWith('properties');
      expect(builder.eq).toHaveBeenCalledWith('agency_id', 'agency-1');
      expect(builder.eq).toHaveBeenCalledWith('available', true);
    });

    it('returns an empty array when there are no properties', async () => {
      const { service } = makeService([{ data: [], error: null }]);

      await expect(service.listAvailableZones('agency-1')).resolves.toEqual([]);
    });

    it('throws a generic error when the query fails', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { service } = makeService([
        { data: null, error: { message: 'db down' } },
      ]);

      await expect(service.listAvailableZones('agency-1')).rejects.toThrow(
        'Failed to list zones',
      );
    });
  });

  describe('listForAdmin', () => {
    it('scopes by agency_id, orders newest first, and paginates via range', async () => {
      const rows = [propertyRow(), propertyRow({ available: false })];
      const { service, builder, from } = makeAdminService([
        { data: rows, error: null, count: 2 },
      ]);

      const result = await service.listForAdmin('agency-1', 2, 10);

      expect(result).toEqual({ data: rows, total: 2 });
      expect(from).toHaveBeenCalledWith('properties');
      expect(builder.select).toHaveBeenCalledWith('*', { count: 'exact' });
      expect(builder.eq).toHaveBeenCalledWith('agency_id', 'agency-1');
      expect(builder.order).toHaveBeenCalledWith('created_at', {
        ascending: false,
      });
      expect(builder.range).toHaveBeenCalledWith(10, 19);
    });

    it('includes unavailable properties (no available filter)', async () => {
      const { service, builder } = makeAdminService([
        { data: [], error: null, count: 0 },
      ]);

      await service.listForAdmin('agency-1', 1, 20);

      expect(builder.eq).not.toHaveBeenCalledWith(
        'available',
        expect.anything(),
      );
    });

    it('throws a generic error when the query fails', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { service } = makeAdminService([
        { data: null, error: { message: 'db down' } },
      ]);

      await expect(service.listForAdmin('agency-1', 1, 20)).rejects.toThrow(
        'Failed to list properties',
      );
    });
  });

  describe('getByIdForAdmin', () => {
    it('returns the property scoped by agency_id + id', async () => {
      const row = propertyRow();
      const { service, builder } = makeAdminService([
        { data: row, error: null },
      ]);

      const result = await service.getByIdForAdmin('agency-1', 'prop-1');

      expect(result).toEqual(row);
      expect(builder.eq).toHaveBeenCalledWith('agency_id', 'agency-1');
      expect(builder.eq).toHaveBeenCalledWith('id', 'prop-1');
    });

    it('throws NotFoundException when the id does not exist or belongs to another agency', async () => {
      const { service } = makeAdminService([{ data: null, error: null }]);

      await expect(
        service.getByIdForAdmin('agency-1', 'missing'),
      ).rejects.toThrow('Property not found');
    });

    it('throws a generic error when the query fails', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { service } = makeAdminService([
        { data: null, error: { message: 'db down' } },
      ]);

      await expect(
        service.getByIdForAdmin('agency-1', 'prop-1'),
      ).rejects.toThrow('Failed to fetch property');
    });
  });

  describe('create', () => {
    it('generates the embedding and inserts a row scoped to the agency', async () => {
      const row = propertyRow();
      const { service, builder, generateEmbedding } = makeAdminService([
        { data: row, error: null },
      ]);

      const result = await service.create('agency-1', createDto);

      expect(result).toEqual(row);
      expect(generateEmbedding).toHaveBeenCalledWith(
        expect.stringContaining('Depto luminoso'),
      );
      expect(builder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          agency_id: 'agency-1',
          title: 'Depto luminoso',
          zone: 'Palermo',
          type: 'apartment',
          operation: 'sale',
          price: 100000,
          currency: 'USD',
          embedding: '[0.1,0.2,0.3]',
        }),
      );
    });

    it('throws a generic error when the insert fails', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { service } = makeAdminService([
        { data: null, error: { message: 'db down' } },
      ]);

      await expect(service.create('agency-1', createDto)).rejects.toThrow(
        'Failed to create property',
      );
    });
  });

  describe('update', () => {
    it('does not re-embed when only a non-embedding field changes', async () => {
      const current = propertyRow();
      const updated = { ...current, price: 150000 };
      const { service, builder, generateEmbedding } = makeAdminService([
        { data: current, error: null }, // getByIdForAdmin
        { data: updated, error: null }, // update().select().single()
      ]);

      const result = await service.update('agency-1', 'prop-1', {
        price: 150000,
      });

      expect(result).toEqual(updated);
      expect(generateEmbedding).not.toHaveBeenCalled();
      expect(builder.update).toHaveBeenCalledWith({ price: 150000 });
    });

    it('re-embeds when an embedding-relevant field changes, merged onto the current row', async () => {
      const current = propertyRow();
      const updated = { ...current, title: 'Depto reformado' };
      const { service, builder, generateEmbedding } = makeAdminService([
        { data: current, error: null },
        { data: updated, error: null },
      ]);

      await service.update('agency-1', 'prop-1', { title: 'Depto reformado' });

      expect(generateEmbedding).toHaveBeenCalledWith(
        expect.stringContaining('Depto reformado'),
      );
      expect(builder.update).toHaveBeenCalledWith({
        title: 'Depto reformado',
        embedding: '[0.1,0.2,0.3]',
      });
    });

    it('maps coveredArea/totalArea/hoaFees to their snake_case columns', async () => {
      const current = propertyRow();
      const { service, builder } = makeAdminService([
        { data: current, error: null },
        { data: current, error: null },
      ]);

      await service.update('agency-1', 'prop-1', {
        coveredArea: 80,
        totalArea: 100,
        hoaFees: 500,
      });

      expect(builder.update).toHaveBeenCalledWith({
        covered_area: 80,
        total_area: 100,
        hoa_fees: 500,
      });
    });

    it('propagates NotFoundException when the property does not exist', async () => {
      const { service } = makeAdminService([{ data: null, error: null }]);

      await expect(
        service.update('agency-1', 'missing', { price: 1 }),
      ).rejects.toThrow('Property not found');
    });

    it('throws a generic error when the update fails', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const current = propertyRow();
      const { service } = makeAdminService([
        { data: current, error: null },
        { data: null, error: { message: 'db down' } },
      ]);

      await expect(
        service.update('agency-1', 'prop-1', { price: 1 }),
      ).rejects.toThrow('Failed to update property');
    });
  });

  describe('setAvailability', () => {
    it('toggles availability without regenerating the embedding', async () => {
      const current = propertyRow();
      const updated = { ...current, available: false };
      const { service, builder, generateEmbedding } = makeAdminService([
        { data: current, error: null }, // getByIdForAdmin existence check
        { data: updated, error: null }, // update
      ]);

      const result = await service.setAvailability('agency-1', 'prop-1', false);

      expect(result).toEqual(updated);
      expect(generateEmbedding).not.toHaveBeenCalled();
      expect(builder.update).toHaveBeenCalledWith({ available: false });
    });

    it('propagates NotFoundException when the property does not exist', async () => {
      const { service } = makeAdminService([{ data: null, error: null }]);

      await expect(
        service.setAvailability('agency-1', 'missing', true),
      ).rejects.toThrow('Property not found');
    });

    it('throws a generic error when the update itself fails', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const current = propertyRow();
      const { service } = makeAdminService([
        { data: current, error: null },
        { data: null, error: { message: 'db down' } },
      ]);

      await expect(
        service.setAvailability('agency-1', 'prop-1', true),
      ).rejects.toThrow('Failed to set availability');
    });
  });
});
