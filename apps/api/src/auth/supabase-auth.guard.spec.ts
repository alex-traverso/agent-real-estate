import { Logger } from '@nestjs/common';
import {
  ExecutionContext,
  ForbiddenException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseAuthGuard } from './supabase-auth.guard';
import type { SupabaseService } from '../common/supabase/supabase.service';
import type { AuthenticatedRequest } from './types/authenticated-request.type';

function makeSupabase(options: {
  getUserResult?: {
    user: { id: string } | null;
    error: { message: string } | null;
  };
  agencyUserResult?: {
    data: { agency_id: string } | null;
    error: { message: string } | null;
  };
}) {
  const getUser = jest.fn().mockResolvedValue({
    data: { user: options.getUserResult?.user ?? null },
    error: options.getUserResult?.error ?? null,
  });
  const maybeSingle = jest
    .fn()
    .mockResolvedValue(options.agencyUserResult ?? { data: null, error: null });
  const eq = jest.fn().mockReturnValue({ maybeSingle });
  const select = jest.fn().mockReturnValue({ eq });
  const from = jest.fn().mockReturnValue({ select });

  const supabase = {
    client: { auth: { getUser }, from },
  } as unknown as SupabaseService;

  return { supabase, getUser, from, select, eq, maybeSingle };
}

function buildContext(request: Partial<AuthenticatedRequest>): {
  context: ExecutionContext;
  request: Partial<AuthenticatedRequest>;
} {
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('SupabaseAuthGuard', () => {
  afterEach(() => jest.restoreAllMocks());

  it('allows a request with a valid token and a linked agency', async () => {
    const { supabase } = makeSupabase({
      getUserResult: { user: { id: 'user-1' }, error: null },
      agencyUserResult: { data: { agency_id: 'agency-1' }, error: null },
    });
    const guard = new SupabaseAuthGuard(supabase);
    const { context, request } = buildContext({
      headers: { authorization: 'Bearer valid-token' },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect((request as AuthenticatedRequest).auth).toEqual({
      userId: 'user-1',
      agencyId: 'agency-1',
    });
  });

  it('rejects a request with no Authorization header', async () => {
    const { supabase } = makeSupabase({});
    const guard = new SupabaseAuthGuard(supabase);
    const { context } = buildContext({
      headers: {},
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a request with a malformed Authorization header (no Bearer prefix)', async () => {
    const { supabase } = makeSupabase({});
    const guard = new SupabaseAuthGuard(supabase);
    const { context } = buildContext({
      headers: { authorization: 'Token abc123' },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a request when the token is invalid or expired', async () => {
    const { supabase } = makeSupabase({
      getUserResult: { user: null, error: { message: 'invalid JWT' } },
    });
    const guard = new SupabaseAuthGuard(supabase);
    const { context } = buildContext({
      headers: { authorization: 'Bearer expired-token' },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a request from a user with no linked agency', async () => {
    const { supabase } = makeSupabase({
      getUserResult: { user: { id: 'user-1' }, error: null },
      agencyUserResult: { data: null, error: null },
    });
    const guard = new SupabaseAuthGuard(supabase);
    const { context } = buildContext({
      headers: { authorization: 'Bearer valid-token' },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('throws a server error when the agency_users lookup fails, and logs it', async () => {
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { supabase } = makeSupabase({
      getUserResult: { user: { id: 'user-1' }, error: null },
      agencyUserResult: { data: null, error: { message: 'db down' } },
    });
    const guard = new SupabaseAuthGuard(supabase);
    const { context } = buildContext({
      headers: { authorization: 'Bearer valid-token' },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      InternalServerErrorException,
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('userId: user-1'),
    );
  });
});
