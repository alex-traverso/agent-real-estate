import { Logger } from '@nestjs/common';
import { PropertiesService } from './properties.service';
import type { SupabaseService } from '../common/supabase/supabase.service';

type Result = { data: unknown; error: { message: string } | null };

/**
 * Chainable Supabase client mock: every builder method returns the same
 * builder. Unlike the conversation mock, these queries are awaited directly
 * (list results, no `.single()`), so the builder is thenable and resolves the
 * next queued result.
 */
function makeClient(results: Result[]) {
  const builder: Record<string, jest.Mock> & { then?: unknown } = {};
  for (const method of ['select', 'eq', 'ilike', 'order', 'limit', 'lte']) {
    builder[method] = jest.fn(() => builder);
  }
  (builder as { then: unknown }).then = (resolve: (v: Result) => unknown) =>
    resolve(results.shift() ?? { data: [], error: null });

  const from = jest.fn(() => builder);
  const supabase = { client: { from } } as unknown as SupabaseService;
  return { supabase, builder, from };
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
      const { supabase, builder, from } = makeClient([
        { data: rows, error: null },
      ]);
      const service = new PropertiesService(supabase);

      const result = await service.searchByFilters('agency-1', {});

      expect(result).toEqual(rows);
      expect(from).toHaveBeenCalledWith('properties');
      expect(builder.eq).toHaveBeenCalledWith('agency_id', 'agency-1');
      expect(builder.eq).toHaveBeenCalledWith('available', true);
      expect(builder.order).toHaveBeenCalledWith('price', { ascending: true });
      expect(builder.limit).toHaveBeenCalledWith(20);
    });

    it('applies each optional filter only when present', async () => {
      const { supabase, builder } = makeClient([{ data: [], error: null }]);
      const service = new PropertiesService(supabase);

      await service.searchByFilters('agency-1', {
        operation: 'rent',
        type: 'apartment',
        zone: 'Palermo',
        rooms: 3,
      });

      expect(builder.eq).toHaveBeenCalledWith('operation', 'rent');
      expect(builder.eq).toHaveBeenCalledWith('type', 'apartment');
      expect(builder.ilike).toHaveBeenCalledWith('zone', '%Palermo%');
      expect(builder.eq).toHaveBeenCalledWith('rooms', 3);
    });

    it('does not apply absent filters', async () => {
      const { supabase, builder } = makeClient([{ data: [], error: null }]);
      const service = new PropertiesService(supabase);

      await service.searchByFilters('agency-1', {});

      expect(builder.eq).not.toHaveBeenCalledWith(
        'operation',
        expect.anything(),
      );
      expect(builder.eq).not.toHaveBeenCalledWith('type', expect.anything());
      expect(builder.ilike).not.toHaveBeenCalled();
      expect(builder.lte).not.toHaveBeenCalled();
    });

    it('applies the price filter only when both maxPrice and currency are given', async () => {
      const { supabase, builder } = makeClient([{ data: [], error: null }]);
      const service = new PropertiesService(supabase);

      await service.searchByFilters('agency-1', {
        maxPrice: 200000,
        currency: 'USD',
      });

      expect(builder.eq).toHaveBeenCalledWith('currency', 'USD');
      expect(builder.lte).toHaveBeenCalledWith('price', 200000);
    });

    it('skips the price filter when currency is missing', async () => {
      const { supabase, builder } = makeClient([{ data: [], error: null }]);
      const service = new PropertiesService(supabase);

      await service.searchByFilters('agency-1', { maxPrice: 200000 });

      expect(builder.lte).not.toHaveBeenCalled();
      expect(builder.eq).not.toHaveBeenCalledWith(
        'currency',
        expect.anything(),
      );
    });

    it('returns an empty array when there are no matches', async () => {
      const { supabase } = makeClient([{ data: [], error: null }]);
      const service = new PropertiesService(supabase);

      await expect(service.searchByFilters('agency-1', {})).resolves.toEqual(
        [],
      );
    });

    it('throws a generic error when the query fails', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { supabase } = makeClient([
        { data: null, error: { message: 'db down' } },
      ]);
      const service = new PropertiesService(supabase);

      await expect(service.searchByFilters('agency-1', {})).rejects.toThrow(
        'Failed to search properties',
      );
    });
  });

  describe('searchByAddress', () => {
    it('matches on partial address scoped by agency_id + available', async () => {
      const rows = [propertyRow()];
      const { supabase, builder } = makeClient([{ data: rows, error: null }]);
      const service = new PropertiesService(supabase);

      const result = await service.searchByAddress('agency-1', 'Santa Fe');

      expect(result).toEqual(rows);
      expect(builder.eq).toHaveBeenCalledWith('agency_id', 'agency-1');
      expect(builder.eq).toHaveBeenCalledWith('available', true);
      expect(builder.ilike).toHaveBeenCalledWith('address', '%Santa Fe%');
      expect(builder.limit).toHaveBeenCalledWith(5);
    });

    it('narrows by zone when provided', async () => {
      const { supabase, builder } = makeClient([{ data: [], error: null }]);
      const service = new PropertiesService(supabase);

      await service.searchByAddress('agency-1', 'Santa Fe', 'Palermo');

      expect(builder.ilike).toHaveBeenCalledWith('address', '%Santa Fe%');
      expect(builder.ilike).toHaveBeenCalledWith('zone', '%Palermo%');
    });

    it('returns an empty array on no match', async () => {
      const { supabase } = makeClient([{ data: [], error: null }]);
      const service = new PropertiesService(supabase);

      await expect(
        service.searchByAddress('agency-1', 'Nowhere'),
      ).resolves.toEqual([]);
    });

    it('throws a generic error when the query fails', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { supabase } = makeClient([
        { data: null, error: { message: 'db down' } },
      ]);
      const service = new PropertiesService(supabase);

      await expect(
        service.searchByAddress('agency-1', 'Santa Fe'),
      ).rejects.toThrow('Failed to search properties');
    });
  });
});
