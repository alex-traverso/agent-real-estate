import { Logger } from '@nestjs/common';
import { LeadsService } from './leads.service';
import type { SupabaseService } from '../common/supabase/supabase.service';
import type { SaveLeadInput } from './types/lead-input.type';

type Result = { data: unknown; error: { message: string } | null };

/**
 * Builds a LeadsService over a chainable Supabase mock. Builder methods return
 * the same builder; `insert(...).select('*').single()` resolves the next queued
 * result via `single`, and the best-effort conversation link (`update().eq().eq()`)
 * is awaited directly, so the builder is also thenable and resolves the next
 * queued result. Each queued result is consumed once, in call order.
 */
function makeService(results: Result[]) {
  const builder: Record<string, jest.Mock> & { then?: unknown } = {};
  for (const method of ['select', 'eq', 'insert', 'update']) {
    builder[method] = jest.fn(() => builder);
  }
  builder.single = jest.fn(() =>
    Promise.resolve(results.shift() ?? { data: null, error: null }),
  );
  (builder as { then: unknown }).then = (resolve: (v: Result) => unknown) =>
    resolve(results.shift() ?? { data: null, error: null });

  const from = jest.fn(() => builder);
  const supabase = { client: { from } } as unknown as SupabaseService;

  const service = new LeadsService(supabase);
  return { service, builder, from };
}

function leadRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lead-1',
    agency_id: 'agency-1',
    phone: '5491122334455',
    name: 'Juan',
    budget_min: null,
    budget_max: null,
    currency: null,
    operation_type: null,
    preferred_zone: null,
    rooms: null,
    property_id: null,
    notes: null,
    status: 'new',
    created_at: '2026-07-09T00:00:00.000Z',
    ...overrides,
  };
}

const baseInput: SaveLeadInput = { phone: '5491122334455', name: 'Juan' };

describe('LeadsService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('inserts a lead scoped by agency_id with status new and returns the row', async () => {
    const row = leadRow();
    const { service, builder, from } = makeService([
      { data: row, error: null },
    ]);

    const result = await service.saveLead('agency-1', baseInput);

    expect(result).toEqual(row);
    expect(from).toHaveBeenCalledWith('leads');
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        agency_id: 'agency-1',
        phone: '5491122334455',
        name: 'Juan',
        status: 'new',
      }),
    );
    expect(builder.select).toHaveBeenCalledWith('*');
    expect(builder.single).toHaveBeenCalled();
  });

  it('maps optional fields to their snake_case columns', async () => {
    const { service, builder } = makeService([
      { data: leadRow(), error: null },
    ]);

    await service.saveLead('agency-1', {
      phone: '5491122334455',
      budgetMax: 200000,
      currency: 'USD',
      operationType: 'sale',
      preferredZone: 'Palermo',
      rooms: 3,
      propertyId: 'prop-1',
      notes: 'quiere balcón',
    });

    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        budget_max: 200000,
        currency: 'USD',
        operation_type: 'sale',
        preferred_zone: 'Palermo',
        rooms: 3,
        property_id: 'prop-1',
        notes: 'quiere balcón',
      }),
    );
  });

  it('throws before any query when phone is missing', async () => {
    const { service, from } = makeService([]);

    await expect(
      service.saveLead('agency-1', { phone: '   ' }),
    ).rejects.toThrow('Missing required lead field: phone');
    expect(from).not.toHaveBeenCalled();
  });

  it('throws a generic error when the insert fails', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { service } = makeService([
      { data: null, error: { message: 'db down' } },
    ]);

    await expect(service.saveLead('agency-1', baseInput)).rejects.toThrow(
      'Failed to save lead',
    );
  });

  it('links the conversation to the lead when conversationId is given', async () => {
    const row = leadRow();
    const { service, builder, from } = makeService([
      { data: row, error: null }, // insert().single()
      { data: null, error: null }, // conversation link update
    ]);

    await service.saveLead('agency-1', baseInput, 'conv-1');

    expect(from).toHaveBeenCalledWith('conversations');
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ lead_id: 'lead-1' }),
    );
    expect(builder.eq).toHaveBeenCalledWith('id', 'conv-1');
    expect(builder.eq).toHaveBeenCalledWith('agency_id', 'agency-1');
  });

  it('still returns the lead when the conversation link fails (best-effort)', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const row = leadRow();
    const { service } = makeService([
      { data: row, error: null }, // insert().single()
      { data: null, error: { message: 'link down' } }, // link fails
    ]);

    await expect(
      service.saveLead('agency-1', baseInput, 'conv-1'),
    ).resolves.toEqual(row);
  });
});
