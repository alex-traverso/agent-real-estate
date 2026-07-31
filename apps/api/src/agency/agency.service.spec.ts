import { ConflictException, Logger } from '@nestjs/common';
import { AgencyService } from './agency.service';
import type { SupabaseService } from '../common/supabase/supabase.service';
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
});
