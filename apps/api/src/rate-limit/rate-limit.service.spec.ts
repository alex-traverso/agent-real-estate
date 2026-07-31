import { RateLimitService } from './rate-limit.service';
import type { SupabaseService } from '../common/supabase/supabase.service';
import {
  RATE_LIMIT_MAX_MESSAGES,
  RATE_LIMIT_WINDOW_MS,
} from './rate-limit.constants';

interface RateLimitRow {
  agency_id: string;
  phone: string;
  window_start: string;
  message_count: number | null;
}

function makeSupabase(existing: RateLimitRow | null) {
  const maybeSingle = jest
    .fn()
    .mockResolvedValue({ data: existing, error: null });
  const eqPhone = jest.fn().mockReturnValue({ maybeSingle });
  const eqAgency = jest.fn().mockReturnValue({ eq: eqPhone });
  const select = jest.fn().mockReturnValue({ eq: eqAgency });
  const upsert = jest.fn().mockResolvedValue({ error: null });
  const from = jest.fn().mockReturnValue({ select, upsert });

  const supabase = {
    client: { from },
  } as unknown as SupabaseService;

  return { supabase, from, select, eqAgency, eqPhone, maybeSingle, upsert };
}

describe('RateLimitService', () => {
  it('allows and starts a new window when no row exists', async () => {
    const { supabase, upsert } = makeSupabase(null);
    const service = new RateLimitService(supabase);

    const allowed = await service.checkAndIncrement('agency-1', '54911111');

    expect(allowed).toBe(true);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        agency_id: 'agency-1',
        phone: '54911111',
        message_count: 1,
      }),
      { onConflict: 'agency_id,phone' },
    );
  });

  it('allows and increments when under the limit', async () => {
    const { supabase, upsert } = makeSupabase({
      agency_id: 'agency-1',
      phone: '54911111',
      window_start: new Date().toISOString(),
      message_count: 5,
    });
    const service = new RateLimitService(supabase);

    const allowed = await service.checkAndIncrement('agency-1', '54911111');

    expect(allowed).toBe(true);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ message_count: 6 }),
      { onConflict: 'agency_id,phone' },
    );
  });

  it('allows the boundary message (20th) and increments to it', async () => {
    const { supabase, upsert } = makeSupabase({
      agency_id: 'agency-1',
      phone: '54911111',
      window_start: new Date().toISOString(),
      message_count: RATE_LIMIT_MAX_MESSAGES - 1,
    });
    const service = new RateLimitService(supabase);

    const allowed = await service.checkAndIncrement('agency-1', '54911111');

    expect(allowed).toBe(true);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ message_count: RATE_LIMIT_MAX_MESSAGES }),
      { onConflict: 'agency_id,phone' },
    );
  });

  it('blocks the 21st message within the window without incrementing', async () => {
    const { supabase, upsert } = makeSupabase({
      agency_id: 'agency-1',
      phone: '54911111',
      window_start: new Date().toISOString(),
      message_count: RATE_LIMIT_MAX_MESSAGES,
    });
    const service = new RateLimitService(supabase);

    const allowed = await service.checkAndIncrement('agency-1', '54911111');

    expect(allowed).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('resets the window once it has expired, even if the phone was previously at the limit', async () => {
    const staleWindowStart = new Date(
      Date.now() - RATE_LIMIT_WINDOW_MS - 1000,
    ).toISOString();
    const { supabase, upsert } = makeSupabase({
      agency_id: 'agency-1',
      phone: '54911111',
      window_start: staleWindowStart,
      message_count: RATE_LIMIT_MAX_MESSAGES,
    });
    const service = new RateLimitService(supabase);

    const allowed = await service.checkAndIncrement('agency-1', '54911111');

    expect(allowed).toBe(true);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ message_count: 1 }),
      { onConflict: 'agency_id,phone' },
    );
  });

  it('fails open (allows) on a Supabase read error, without touching state', async () => {
    const maybeSingle = jest
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'db down' } });
    const eqPhone = jest.fn().mockReturnValue({ maybeSingle });
    const eqAgency = jest.fn().mockReturnValue({ eq: eqPhone });
    const select = jest.fn().mockReturnValue({ eq: eqAgency });
    const upsert = jest.fn().mockResolvedValue({ error: null });
    const from = jest.fn().mockReturnValue({ select, upsert });
    const supabase = { client: { from } } as unknown as SupabaseService;
    const service = new RateLimitService(supabase);

    const allowed = await service.checkAndIncrement('agency-1', '54911111');

    expect(allowed).toBe(true);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('treats a null message_count as zero and increments to one', async () => {
    const { supabase, upsert } = makeSupabase({
      agency_id: 'agency-1',
      phone: '54911111',
      window_start: new Date().toISOString(),
      message_count: null,
    });
    const service = new RateLimitService(supabase);

    const allowed = await service.checkAndIncrement('agency-1', '54911111');

    expect(allowed).toBe(true);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ message_count: 1 }),
      { onConflict: 'agency_id,phone' },
    );
  });

  it('fails soft (still allows) when persisting the window state errors', async () => {
    const { supabase, upsert } = makeSupabase(null);
    upsert.mockResolvedValue({ error: { message: 'db down' } });
    const service = new RateLimitService(supabase);

    const allowed = await service.checkAndIncrement('agency-1', '54911111');

    // A failed persist must not block the message — the error is logged and
    // swallowed, same fail-soft posture as the read-error path above.
    expect(allowed).toBe(true);
    expect(upsert).toHaveBeenCalled();
  });
});
