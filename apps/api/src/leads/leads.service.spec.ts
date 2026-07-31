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

type AdminResult = {
  data: unknown;
  error: { message: string } | null;
  count?: number | null;
};

/**
 * Builder mock for the admin methods: same chainable style as makeService
 * above, but range()/maybeSingle()/single() are all terminals that each pop
 * the next queued result — matching how listForAdmin/getByIdForAdmin/
 * updateStatus actually terminate their query chains.
 */
function makeAdminService(results: AdminResult[]) {
  const builder: Record<string, jest.Mock> = {};
  for (const method of ['select', 'eq', 'order', 'insert', 'update']) {
    builder[method] = jest.fn(() => builder);
  }
  const pop = () => results.shift() ?? { data: null, error: null };
  builder.range = jest.fn(() => Promise.resolve(pop()));
  builder.maybeSingle = jest.fn(() => Promise.resolve(pop()));
  builder.single = jest.fn(() => Promise.resolve(pop()));

  const from = jest.fn(() => builder);
  const supabase = { client: { from } } as unknown as SupabaseService;

  const service = new LeadsService(supabase);
  return { service, builder, from };
}

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

  describe('listForAdmin', () => {
    it('scopes by agency_id, orders newest first, and paginates via range', async () => {
      const rows = [leadRow(), leadRow({ id: 'lead-2', status: 'contacted' })];
      const { service, builder, from } = makeAdminService([
        { data: rows, error: null, count: 2 },
      ]);

      const result = await service.listForAdmin('agency-1', 2, 10);

      expect(result).toEqual({ data: rows, total: 2 });
      expect(from).toHaveBeenCalledWith('leads');
      expect(builder.select).toHaveBeenCalledWith('*', { count: 'exact' });
      expect(builder.eq).toHaveBeenCalledWith('agency_id', 'agency-1');
      expect(builder.order).toHaveBeenCalledWith('created_at', {
        ascending: false,
      });
    });

    it('applies the status filter only when given', async () => {
      const { service, builder } = makeAdminService([
        { data: [], error: null, count: 0 },
      ]);

      await service.listForAdmin('agency-1', 1, 20, 'contacted');

      expect(builder.eq).toHaveBeenCalledWith('status', 'contacted');
    });

    it('does not filter by status when omitted', async () => {
      const { service, builder } = makeAdminService([
        { data: [], error: null, count: 0 },
      ]);

      await service.listForAdmin('agency-1', 1, 20);

      expect(builder.eq).not.toHaveBeenCalledWith('status', expect.anything());
    });

    it('throws a generic error when the query fails', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { service } = makeAdminService([
        { data: null, error: { message: 'db down' } },
      ]);

      await expect(service.listForAdmin('agency-1', 1, 20)).rejects.toThrow(
        'Failed to list leads',
      );
    });
  });

  describe('getByIdForAdmin', () => {
    it('returns the lead scoped by agency_id + id', async () => {
      const row = leadRow();
      const { service, builder } = makeAdminService([
        { data: row, error: null },
      ]);

      const result = await service.getByIdForAdmin('agency-1', 'lead-1');

      expect(result).toEqual(row);
      expect(builder.eq).toHaveBeenCalledWith('agency_id', 'agency-1');
      expect(builder.eq).toHaveBeenCalledWith('id', 'lead-1');
    });

    it('throws NotFoundException when the id does not exist or belongs to another agency', async () => {
      const { service } = makeAdminService([{ data: null, error: null }]);

      await expect(
        service.getByIdForAdmin('agency-1', 'missing'),
      ).rejects.toThrow('Lead not found');
    });

    it('throws a generic error when the query fails', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { service } = makeAdminService([
        { data: null, error: { message: 'db down' } },
      ]);

      await expect(
        service.getByIdForAdmin('agency-1', 'lead-1'),
      ).rejects.toThrow('Failed to fetch lead');
    });
  });

  describe('getConversationForLead', () => {
    it('confirms the lead exists, then returns its conversation scoped by agency_id + lead_id', async () => {
      const lead = leadRow();
      const conversation = {
        id: 'conv-1',
        agency_id: 'agency-1',
        lead_id: 'lead-1',
      };
      const { service, builder, from } = makeAdminService([
        { data: lead, error: null }, // getByIdForAdmin
        { data: conversation, error: null }, // conversations lookup
      ]);

      const result = await service.getConversationForLead('agency-1', 'lead-1');

      expect(result).toEqual(conversation);
      expect(from).toHaveBeenCalledWith('conversations');
      expect(builder.eq).toHaveBeenCalledWith('lead_id', 'lead-1');
    });

    it('returns null when the lead has no associated conversation', async () => {
      const lead = leadRow();
      const { service } = makeAdminService([
        { data: lead, error: null },
        { data: null, error: null },
      ]);

      await expect(
        service.getConversationForLead('agency-1', 'lead-1'),
      ).resolves.toBeNull();
    });

    it('propagates NotFoundException when the lead does not exist', async () => {
      const { service } = makeAdminService([{ data: null, error: null }]);

      await expect(
        service.getConversationForLead('agency-1', 'missing'),
      ).rejects.toThrow('Lead not found');
    });

    it('throws a generic error when the conversation query fails', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const lead = leadRow();
      const { service } = makeAdminService([
        { data: lead, error: null },
        { data: null, error: { message: 'db down' } },
      ]);

      await expect(
        service.getConversationForLead('agency-1', 'lead-1'),
      ).rejects.toThrow('Failed to fetch lead conversation');
    });
  });

  describe('updateStatus', () => {
    it('confirms existence, then updates the status and returns the row', async () => {
      const current = leadRow();
      const updated = { ...current, status: 'contacted' };
      const { service, builder } = makeAdminService([
        { data: current, error: null }, // getByIdForAdmin
        { data: updated, error: null }, // update
      ]);

      const result = await service.updateStatus(
        'agency-1',
        'lead-1',
        'contacted',
      );

      expect(result).toEqual(updated);
      expect(builder.update).toHaveBeenCalledWith({ status: 'contacted' });
    });

    it('propagates NotFoundException when the lead does not exist', async () => {
      const { service } = makeAdminService([{ data: null, error: null }]);

      await expect(
        service.updateStatus('agency-1', 'missing', 'closed'),
      ).rejects.toThrow('Lead not found');
    });

    it('throws a generic error when the update fails', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const current = leadRow();
      const { service } = makeAdminService([
        { data: current, error: null },
        { data: null, error: { message: 'db down' } },
      ]);

      await expect(
        service.updateStatus('agency-1', 'lead-1', 'closed'),
      ).rejects.toThrow('Failed to update lead status');
    });
  });
});
