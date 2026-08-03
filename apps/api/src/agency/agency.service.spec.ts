import { BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { AgencyService } from './agency.service';
import type { SupabaseService } from '../common/supabase/supabase.service';
import { AGENCY_CACHE_TTL_MS } from './agency.constants';
import type { CreateAgencyDto } from './dto/create-agency.dto';

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

  it('re-reads a cached mapping once its TTL has passed', async () => {
    const { service, from } = createService({
      data: { id: 'agency-1' },
      error: null,
    });
    const start = Date.now();
    const now = jest.spyOn(Date, 'now').mockReturnValue(start);

    await service.resolveIdByPhoneNumberId('pnid-123');
    now.mockReturnValue(start + AGENCY_CACHE_TTL_MS + 1);
    await service.resolveIdByPhoneNumberId('pnid-123');

    // Without the TTL, an instance that didn't serve the PATCH would keep a
    // released number pointing at its old agency until the next restart.
    expect(from).toHaveBeenCalledTimes(2);
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

  describe('findByUserId', () => {
    function createFindByUserIdService(options: {
      membership?: {
        data: { agency_id: string } | null;
        error: { message: string } | null;
      };
      agency?: {
        data: { id: string } | null;
        error: { message: string } | null;
      };
    }) {
      const membershipMaybeSingle = jest
        .fn()
        .mockResolvedValue(options.membership ?? { data: null, error: null });
      const membershipEq = jest
        .fn()
        .mockReturnValue({ maybeSingle: membershipMaybeSingle });
      const membershipSelect = jest.fn().mockReturnValue({ eq: membershipEq });

      const agencyMaybeSingle = jest
        .fn()
        .mockResolvedValue(options.agency ?? { data: null, error: null });
      const agencyEq = jest
        .fn()
        .mockReturnValue({ maybeSingle: agencyMaybeSingle });
      const agencySelect = jest.fn().mockReturnValue({ eq: agencyEq });

      const from = jest.fn((table: string) => {
        if (table === 'agency_users') return { select: membershipSelect };
        return { select: agencySelect };
      });
      const supabase = { client: { from } } as unknown as SupabaseService;
      return {
        service: new AgencyService(supabase),
        from,
        membershipEq,
        agencyEq,
      };
    }

    it('returns the agency for a user with a membership row', async () => {
      const { service, membershipEq, agencyEq } = createFindByUserIdService({
        membership: { data: { agency_id: 'agency-1' }, error: null },
        agency: { data: { id: 'agency-1' }, error: null },
      });

      const agency = await service.findByUserId('user-1');

      expect(agency).toEqual({ id: 'agency-1' });
      expect(membershipEq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(agencyEq).toHaveBeenCalledWith('id', 'agency-1');
    });

    it('returns null when the user has no membership row', async () => {
      const { service } = createFindByUserIdService({
        membership: { data: null, error: null },
      });

      expect(await service.findByUserId('user-1')).toBeNull();
    });

    it('throws when the membership lookup fails', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { service } = createFindByUserIdService({
        membership: { data: null, error: { message: 'db down' } },
      });

      await expect(service.findByUserId('user-1')).rejects.toThrow(
        'Failed to resolve agency',
      );
    });

    it('throws when the membership row points at an agency that cannot be loaded', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { service } = createFindByUserIdService({
        membership: { data: { agency_id: 'agency-1' }, error: null },
        agency: { data: null, error: { message: 'db down' } },
      });

      await expect(service.findByUserId('user-1')).rejects.toThrow(
        'Failed to resolve agency',
      );
    });
  });

  describe('createForUser', () => {
    const dto: CreateAgencyDto = {
      name: 'Inmobiliaria Test',
      email: 'test@agency.com',
    };

    function createRpcService(result: {
      data: { id: string } | null;
      error: { code?: string; message: string } | null;
    }) {
      const rpc = jest.fn().mockResolvedValue(result);
      const supabase = { client: { rpc } } as unknown as SupabaseService;
      return { service: new AgencyService(supabase), rpc };
    }

    it('creates the agency via the RPC and returns it', async () => {
      const { service, rpc } = createRpcService({
        data: { id: 'agency-1' },
        error: null,
      });

      const agency = await service.createForUser('user-1', dto);

      expect(agency).toEqual({ id: 'agency-1' });
      expect(rpc).toHaveBeenCalledWith('create_agency_with_owner', {
        p_name: dto.name,
        p_email: dto.email,
        p_user_id: 'user-1',
      });
    });

    it('includes the phone in the RPC call only when provided', async () => {
      const { service, rpc } = createRpcService({
        data: { id: 'agency-1' },
        error: null,
      });

      await service.createForUser('user-1', { ...dto, phone: '+541122334455' });

      expect(rpc).toHaveBeenCalledWith('create_agency_with_owner', {
        p_name: dto.name,
        p_email: dto.email,
        p_user_id: 'user-1',
        p_phone: '+541122334455',
      });
    });

    it('maps a unique violation on agency_users.user_id to a Conflict', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { service } = createRpcService({
        data: null,
        error: {
          code: '23505',
          message:
            'duplicate key value violates unique constraint "agency_users_user_id_key"',
        },
      });

      await expect(service.createForUser('user-1', dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('maps a unique violation on agencies.email to a Conflict', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { service } = createRpcService({
        data: null,
        error: {
          code: '23505',
          message:
            'duplicate key value violates unique constraint "agencies_email_key"',
        },
      });

      await expect(service.createForUser('user-1', dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws a generic error for any other RPC failure', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { service } = createRpcService({
        data: null,
        error: { message: 'connection reset' },
      });

      await expect(service.createForUser('user-1', dto)).rejects.toThrow(
        'Failed to create agency',
      );
    });

    it('throws when the RPC returns no row', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { service } = createRpcService({ data: null, error: null });

      await expect(service.createForUser('user-1', dto)).rejects.toThrow(
        'Failed to create agency',
      );
    });
  });

  describe('updateForAgency', () => {
    /**
     * One mock serving both query shapes the update path touches: the
     * `select().eq().maybeSingle()` reads (resolveIdByPhoneNumberId,
     * getContactEmail) and the `update().eq().select().single()` write — the
     * cache-invalidation tests interleave them against the same service.
     */
    function createUpdateService(options?: {
      update?: {
        data: unknown;
        error: { code?: string; message: string } | null;
      };
      read?: MaybeSingleResult;
    }) {
      const single = jest
        .fn()
        .mockResolvedValue(
          options?.update ?? { data: { id: 'agency-1' }, error: null },
        );
      const updateSelect = jest.fn().mockReturnValue({ single });
      const updateEq = jest.fn().mockReturnValue({ select: updateSelect });
      const update = jest.fn().mockReturnValue({ eq: updateEq });

      const maybeSingle = jest
        .fn()
        .mockResolvedValue(options?.read ?? { data: null, error: null });
      const readEq = jest.fn().mockReturnValue({ maybeSingle });
      const select = jest.fn().mockReturnValue({ eq: readEq });

      const from = jest.fn().mockReturnValue({ select, update });
      const supabase = { client: { from } } as unknown as SupabaseService;
      return {
        service: new AgencyService(supabase),
        update,
        updateEq,
        select,
      };
    }

    it('writes only the fields present in the dto, mapped to snake_case', async () => {
      jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      const { service, update, updateEq } = createUpdateService();

      await service.updateForAgency('agency-1', {
        name: 'Inmobiliaria Test',
        whatsappPhoneNumberId: '123456789012345',
      });

      expect(update).toHaveBeenCalledWith({
        name: 'Inmobiliaria Test',
        whatsapp_phone_number_id: '123456789012345',
      });
      expect(updateEq).toHaveBeenCalledWith('id', 'agency-1');
    });

    it('treats an explicit null as "clear this column", not as absent', async () => {
      jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      const { service, update } = createUpdateService();

      await service.updateForAgency('agency-1', {
        whatsappPhoneNumberId: null,
      });

      expect(update).toHaveBeenCalledWith({ whatsapp_phone_number_id: null });
    });

    it('rejects a dto with no fields instead of issuing an empty update', async () => {
      const { service, update } = createUpdateService();

      await expect(service.updateForAgency('agency-1', {})).rejects.toThrow(
        BadRequestException,
      );
      expect(update).not.toHaveBeenCalled();
    });

    it('maps a unique violation on whatsapp_phone_number_id to a Conflict', async () => {
      const { service } = createUpdateService({
        update: {
          data: null,
          error: {
            code: '23505',
            message:
              'duplicate key value violates unique constraint "agencies_whatsapp_phone_number_id_key"',
          },
        },
      });

      await expect(
        service.updateForAgency('agency-1', {
          whatsappPhoneNumberId: '123456789012345',
        }),
      ).rejects.toThrow(
        'Ese número de WhatsApp ya está vinculado a otra inmobiliaria.',
      );
    });

    it('maps a unique violation on agencies.email to a Conflict', async () => {
      const { service } = createUpdateService({
        update: {
          data: null,
          error: {
            code: '23505',
            message:
              'duplicate key value violates unique constraint "agencies_email_key"',
          },
        },
      });

      await expect(
        service.updateForAgency('agency-1', { email: 'taken@agency.com' }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws a generic error for any other update failure', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { service } = createUpdateService({
        update: { data: null, error: { message: 'connection reset' } },
      });

      await expect(
        service.updateForAgency('agency-1', { name: 'Nueva' }),
      ).rejects.toThrow('Failed to update agency');
    });

    it('evicts the number this agency just released from the cache', async () => {
      jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      const { service, select } = createUpdateService({
        read: { data: { id: 'agency-1' }, error: null },
      });

      await service.resolveIdByPhoneNumberId('pnid-old');
      await service.updateForAgency('agency-1', {
        whatsappPhoneNumberId: null,
      });
      await service.resolveIdByPhoneNumberId('pnid-old');

      // Two reads, not one: the cached pnid-old -> agency-1 entry is gone.
      expect(select).toHaveBeenCalledTimes(2);
    });

    it('evicts a number claimed from another agency, so it cannot route to the previous owner', async () => {
      jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      const { service, select } = createUpdateService({
        read: { data: { id: 'agency-2' }, error: null },
      });

      await service.resolveIdByPhoneNumberId('pnid-shared');
      await service.updateForAgency('agency-1', {
        whatsappPhoneNumberId: 'pnid-shared',
      });
      await service.resolveIdByPhoneNumberId('pnid-shared');

      expect(select).toHaveBeenCalledTimes(2);
    });

    it('evicts the cached contact email so escalations reach the new address', async () => {
      jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      const { service, select } = createUpdateService({
        read: { data: { email: 'old@agency.com' }, error: null },
      });

      await service.getContactEmail('agency-1');
      await service.updateForAgency('agency-1', { email: 'new@agency.com' });
      await service.getContactEmail('agency-1');

      expect(select).toHaveBeenCalledTimes(2);
    });
  });
});
