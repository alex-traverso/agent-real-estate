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
    type: 'apartment',
    operation: 'sale',
    price: 100000,
    currency: 'USD',
    zone: 'Palermo',
    address: 'Av. Santa Fe 4200',
    available: true,
    ...overrides,
  };
}

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
});
