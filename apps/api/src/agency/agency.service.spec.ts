import { Logger } from '@nestjs/common';
import { AgencyService } from './agency.service';
import type { SupabaseService } from '../common/supabase/supabase.service';

type MaybeSingleResult = {
  data: { id?: string; email?: string } | null;
  error: { message: string } | null;
};

function createService(result: MaybeSingleResult) {
  const maybeSingle = jest.fn().mockResolvedValue(result);
  const eq = jest.fn().mockReturnValue({ maybeSingle });
  const select = jest.fn().mockReturnValue({ eq });
  const from = jest.fn().mockReturnValue({ select });
  const supabase = { client: { from } } as unknown as SupabaseService;
  return { service: new AgencyService(supabase), from, eq };
}

describe('AgencyService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('resolves the agency id for a known phone_number_id', async () => {
    const { service, eq } = createService({
      data: { id: 'agency-1' },
      error: null,
    });

    const id = await service.resolveIdByPhoneNumberId('pnid-123');

    expect(id).toBe('agency-1');
    expect(eq).toHaveBeenCalledWith('whatsapp_phone_number_id', 'pnid-123');
  });

  it('caches the result and does not query twice', async () => {
    const { service, from } = createService({
      data: { id: 'agency-1' },
      error: null,
    });

    await service.resolveIdByPhoneNumberId('pnid-123');
    await service.resolveIdByPhoneNumberId('pnid-123');

    expect(from).toHaveBeenCalledTimes(1);
  });

  it('returns null when no agency is registered for the number', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { service } = createService({ data: null, error: null });

    expect(await service.resolveIdByPhoneNumberId('unknown')).toBeNull();
  });

  it('returns null on a query error', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { service } = createService({
      data: null,
      error: { message: 'boom' },
    });

    expect(await service.resolveIdByPhoneNumberId('pnid-123')).toBeNull();
  });

  describe('getContactEmail', () => {
    it('returns the agency contact email for a known agency', async () => {
      const { service, eq } = createService({
        data: { email: 'advisor@agency.com' },
        error: null,
      });

      const email = await service.getContactEmail('agency-1');

      expect(email).toBe('advisor@agency.com');
      expect(eq).toHaveBeenCalledWith('id', 'agency-1');
    });

    it('caches the result and does not query twice', async () => {
      const { service, from } = createService({
        data: { email: 'advisor@agency.com' },
        error: null,
      });

      await service.getContactEmail('agency-1');
      await service.getContactEmail('agency-1');

      expect(from).toHaveBeenCalledTimes(1);
    });

    it('returns null when the agency has no email', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { service } = createService({ data: {}, error: null });

      expect(await service.getContactEmail('agency-1')).toBeNull();
    });

    it('returns null on a query error', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { service } = createService({
        data: null,
        error: { message: 'boom' },
      });

      expect(await service.getContactEmail('agency-1')).toBeNull();
    });
  });
});
