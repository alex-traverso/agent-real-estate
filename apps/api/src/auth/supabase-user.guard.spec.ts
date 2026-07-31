import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { SupabaseUserGuard } from './supabase-user.guard';
import type { SupabaseService } from '../common/supabase/supabase.service';
import type { AuthenticatedUserRequest } from './types/authenticated-user-request.type';

function makeSupabase(options: {
  getUserResult?: {
    user: { id: string } | null;
    error: { message: string } | null;
  };
}) {
  const getUser = jest.fn().mockResolvedValue({
    data: { user: options.getUserResult?.user ?? null },
    error: options.getUserResult?.error ?? null,
  });
  const from = jest.fn();

  const supabase = {
    client: { auth: { getUser }, from },
  } as unknown as SupabaseService;

  return { supabase, getUser, from };
}

function buildContext(request: Partial<AuthenticatedUserRequest>): {
  context: ExecutionContext;
  request: Partial<AuthenticatedUserRequest>;
} {
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('SupabaseUserGuard', () => {
  afterEach(() => jest.restoreAllMocks());

  it('allows a request with a valid token and attaches userId, without querying agency_users', async () => {
    const { supabase, from } = makeSupabase({
      getUserResult: { user: { id: 'user-1' }, error: null },
    });
    const guard = new SupabaseUserGuard(supabase);
    const { context, request } = buildContext({
      headers: { authorization: 'Bearer valid-token' },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect((request as AuthenticatedUserRequest).user).toEqual({
      userId: 'user-1',
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('rejects a request with no Authorization header', async () => {
    const { supabase } = makeSupabase({});
    const guard = new SupabaseUserGuard(supabase);
    const { context } = buildContext({ headers: {} });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a request with a malformed Authorization header (no Bearer prefix)', async () => {
    const { supabase } = makeSupabase({});
    const guard = new SupabaseUserGuard(supabase);
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
    const guard = new SupabaseUserGuard(supabase);
    const { context } = buildContext({
      headers: { authorization: 'Bearer expired-token' },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
