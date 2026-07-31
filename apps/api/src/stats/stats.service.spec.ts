import { Logger } from '@nestjs/common';
import { StatsService } from './stats.service';
import type { SupabaseService } from '../common/supabase/supabase.service';
import { LEAD_TREND_DAYS, TOP_ZONES_LIMIT } from './stats.constants';

type Result = { data: unknown; error: { message: string } | null };

/**
 * Builds a StatsService over a chainable Supabase mock. Both queries end on
 * `.eq('agency_id', ...)` and are awaited directly, so the builder is thenable
 * and each await pops the next queued result — properties first, then leads
 * (the order getAgencyStats passes them to Promise.all).
 */
function makeService(results: Result[]) {
  const builder: Record<string, jest.Mock> & { then?: unknown } = {};
  for (const method of ['select', 'eq']) {
    builder[method] = jest.fn(() => builder);
  }
  (builder as { then: unknown }).then = (resolve: (v: Result) => unknown) =>
    resolve(results.shift() ?? { data: [], error: null });

  const from = jest.fn(() => builder);
  const supabase = { client: { from } } as unknown as SupabaseService;

  return { service: new StatsService(supabase), builder, from };
}

function propertyRow(overrides: Record<string, unknown> = {}) {
  return {
    available: true,
    operation: 'sale',
    type: 'apartment',
    zone: 'Palermo',
    price: 100000,
    currency: 'USD',
    ...overrides,
  };
}

function leadRow(overrides: Record<string, unknown> = {}) {
  return {
    status: 'new',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/** Same `YYYY-MM-DD` key the service buckets by, offset by whole days. */
function reportingDay(daysAgo = 0): string {
  const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

describe('StatsService', () => {
  afterEach(() => jest.restoreAllMocks());

  describe('getAgencyStats', () => {
    it('scopes both queries by agency_id and selects only the needed columns', async () => {
      const { service, builder, from } = makeService([
        { data: [], error: null },
        { data: [], error: null },
      ]);

      await service.getAgencyStats('agency-1');

      expect(from).toHaveBeenCalledWith('properties');
      expect(from).toHaveBeenCalledWith('leads');
      expect(builder.select).toHaveBeenCalledWith(
        'available, operation, type, zone, price, currency',
      );
      expect(builder.select).toHaveBeenCalledWith('status, created_at');
      expect(builder.eq).toHaveBeenCalledTimes(2);
      expect(builder.eq).toHaveBeenCalledWith('agency_id', 'agency-1');
    });

    it('returns zeroed counters for an agency with no data', async () => {
      const { service } = makeService([
        { data: [], error: null },
        { data: [], error: null },
      ]);

      const stats = await service.getAgencyStats('agency-1');

      expect(stats.properties).toEqual({
        total: 0,
        available: 0,
        unavailable: 0,
        byOperation: { rent: 0, sale: 0, temporary: 0 },
        byType: { house: 0, apartment: 0, ph: 0, office: 0, land: 0 },
        byZone: [],
        medianPrice: { ARS: null, USD: null },
      });
      expect(stats.leads.total).toBe(0);
      expect(stats.leads.byStatus).toEqual({ new: 0, contacted: 0, closed: 0 });
      expect(stats.leads.last30Days).toHaveLength(LEAD_TREND_DAYS);
      expect(stats.leads.last30Days.every((day) => day.count === 0)).toBe(true);
    });

    it('splits available from unavailable, counting NULL as unavailable', async () => {
      const { service } = makeService([
        {
          data: [
            propertyRow(),
            propertyRow({ available: false }),
            propertyRow({ available: null }),
          ],
          error: null,
        },
        { data: [], error: null },
      ]);

      const { properties } = await service.getAgencyStats('agency-1');

      expect(properties.total).toBe(3);
      expect(properties.available).toBe(1);
      expect(properties.unavailable).toBe(2);
    });

    it('breaks properties down by operation and type', async () => {
      const { service } = makeService([
        {
          data: [
            propertyRow({ operation: 'sale', type: 'apartment' }),
            propertyRow({ operation: 'rent', type: 'house' }),
            propertyRow({ operation: 'rent', type: 'house' }),
          ],
          error: null,
        },
        { data: [], error: null },
      ]);

      const { properties } = await service.getAgencyStats('agency-1');

      expect(properties.byOperation).toEqual({
        rent: 2,
        sale: 1,
        temporary: 0,
      });
      expect(properties.byType).toEqual({
        house: 2,
        apartment: 1,
        ph: 0,
        office: 0,
        land: 0,
      });
    });

    it('ranks zones by count, breaking ties alphabetically', async () => {
      const { service } = makeService([
        {
          data: [
            propertyRow({ zone: 'Palermo' }),
            propertyRow({ zone: 'Palermo' }),
            propertyRow({ zone: 'Villa Urquiza' }),
            propertyRow({ zone: 'Nordelta' }),
          ],
          error: null,
        },
        { data: [], error: null },
      ]);

      const { properties } = await service.getAgencyStats('agency-1');

      expect(properties.byZone).toEqual([
        { zone: 'Palermo', count: 2 },
        { zone: 'Nordelta', count: 1 },
        { zone: 'Villa Urquiza', count: 1 },
      ]);
    });

    it('caps the zone breakdown at TOP_ZONES_LIMIT', async () => {
      const data = Array.from({ length: TOP_ZONES_LIMIT + 4 }, (_, index) =>
        propertyRow({ zone: `Zona ${index}` }),
      );
      const { service } = makeService([
        { data, error: null },
        { data: [], error: null },
      ]);

      const { properties } = await service.getAgencyStats('agency-1');

      expect(properties.byZone).toHaveLength(TOP_ZONES_LIMIT);
    });

    it('medians prices per currency over available listings only', async () => {
      const { service } = makeService([
        {
          data: [
            propertyRow({ price: 100, currency: 'USD' }),
            propertyRow({ price: 300, currency: 'USD' }),
            propertyRow({ price: 200, currency: 'USD' }),
            // Excluded from the median: not available.
            propertyRow({ price: 999999, currency: 'USD', available: false }),
            propertyRow({ price: 1000, currency: 'ARS' }),
            propertyRow({ price: 3000, currency: 'ARS' }),
          ],
          error: null,
        },
        { data: [], error: null },
      ]);

      const { properties } = await service.getAgencyStats('agency-1');

      expect(properties.medianPrice.USD).toBe(200);
      // Even count: the average of the two middle values.
      expect(properties.medianPrice.ARS).toBe(2000);
    });

    it('counts leads by status, reading NULL as new', async () => {
      const { service } = makeService([
        { data: [], error: null },
        {
          data: [
            leadRow({ status: 'new' }),
            leadRow({ status: null }),
            leadRow({ status: 'contacted' }),
            leadRow({ status: 'closed' }),
          ],
          error: null,
        },
      ]);

      const { leads } = await service.getAgencyStats('agency-1');

      expect(leads.total).toBe(4);
      expect(leads.byStatus).toEqual({ new: 2, contacted: 1, closed: 1 });
    });

    it('buckets the lead trend by day, zero-filling the quiet days', async () => {
      const { service } = makeService([
        { data: [], error: null },
        {
          data: [
            leadRow(),
            leadRow(),
            leadRow({
              created_at: new Date(
                Date.now() - 2 * 24 * 60 * 60 * 1000,
              ).toISOString(),
            }),
          ],
          error: null,
        },
      ]);

      const { leads } = await service.getAgencyStats('agency-1');
      const byDate = new Map(
        leads.last30Days.map((day) => [day.date, day.count]),
      );

      expect(leads.last30Days).toHaveLength(LEAD_TREND_DAYS);
      expect(leads.last30Days.at(-1)?.date).toBe(reportingDay(0));
      expect(byDate.get(reportingDay(0))).toBe(2);
      expect(byDate.get(reportingDay(2))).toBe(1);
      expect(byDate.get(reportingDay(1))).toBe(0);
    });

    it('ignores leads without a created_at but still counts them in the total', async () => {
      const { service } = makeService([
        { data: [], error: null },
        { data: [leadRow({ created_at: null })], error: null },
      ]);

      const { leads } = await service.getAgencyStats('agency-1');

      expect(leads.total).toBe(1);
      expect(leads.last30Days.every((day) => day.count === 0)).toBe(true);
    });

    it('drops leads older than the trend window from the series', async () => {
      const { service } = makeService([
        { data: [], error: null },
        {
          data: [
            leadRow({
              created_at: new Date(
                Date.now() - (LEAD_TREND_DAYS + 5) * 24 * 60 * 60 * 1000,
              ).toISOString(),
            }),
          ],
          error: null,
        },
      ]);

      const { leads } = await service.getAgencyStats('agency-1');

      expect(leads.total).toBe(1);
      expect(leads.last30Days.every((day) => day.count === 0)).toBe(true);
    });

    it('throws a generic error when the property query fails', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { service } = makeService([
        { data: null, error: { message: 'db down' } },
        { data: [], error: null },
      ]);

      await expect(service.getAgencyStats('agency-1')).rejects.toThrow(
        'Failed to load statistics',
      );
    });

    it('throws a generic error when the lead query fails', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { service } = makeService([
        { data: [], error: null },
        { data: null, error: { message: 'db down' } },
      ]);

      await expect(service.getAgencyStats('agency-1')).rejects.toThrow(
        'Failed to load statistics',
      );
    });

    it('tolerates a null data payload without an error', async () => {
      const { service } = makeService([
        { data: null, error: null },
        { data: null, error: null },
      ]);

      const stats = await service.getAgencyStats('agency-1');

      expect(stats.properties.total).toBe(0);
      expect(stats.leads.total).toBe(0);
    });
  });
});
