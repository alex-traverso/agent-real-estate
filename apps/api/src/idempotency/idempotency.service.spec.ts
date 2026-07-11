import { Logger } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';
import type { SupabaseService } from '../common/supabase/supabase.service';

function makeSupabase(error: { code?: string; message: string } | null) {
  const insert = jest.fn().mockResolvedValue({ error });
  const from = jest.fn().mockReturnValue({ insert });
  const supabase = { client: { from } } as unknown as SupabaseService;
  return { supabase, from, insert };
}

describe('IdempotencyService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns true and records the message on the first delivery', async () => {
    const { supabase, insert } = makeSupabase(null);
    const service = new IdempotencyService(supabase);

    const firstDelivery = await service.checkAndMark(
      'agency-1',
      'wamid.ABC123',
    );

    expect(firstDelivery).toBe(true);
    expect(insert).toHaveBeenCalledWith({
      agency_id: 'agency-1',
      message_id: 'wamid.ABC123',
    });
  });

  it('returns false on a unique violation (Meta redelivery)', async () => {
    const { supabase } = makeSupabase({
      code: '23505',
      message: 'duplicate key value violates unique constraint',
    });
    const service = new IdempotencyService(supabase);

    const firstDelivery = await service.checkAndMark(
      'agency-1',
      'wamid.ABC123',
    );

    expect(firstDelivery).toBe(false);
  });

  it('fails open (returns true) on any other Supabase error, and logs it', async () => {
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { supabase } = makeSupabase({ message: 'db down' });
    const service = new IdempotencyService(supabase);

    const firstDelivery = await service.checkAndMark(
      'agency-1',
      'wamid.ABC123',
    );

    expect(firstDelivery).toBe(true);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('agencyId: agency-1'),
    );
  });
});
