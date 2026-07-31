import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { SupabaseService } from '../common/supabase/supabase.service';
import { verifySupabaseToken } from './supabase-token.util';
import type { AuthenticatedUserRequest } from './types/authenticated-user-request.type';

/**
 * Authenticates admin panel requests that must work for a user with no
 * agency yet — currently only the agency-onboarding endpoints
 * (GET/POST /agencies). Verifies the Supabase Auth access token and attaches
 * { userId } to the request, but never looks up agency_users: a user who
 * legitimately has no agency (the whole point of onboarding) must not be
 * rejected. Every other admin route uses SupabaseAuthGuard, which does
 * require a linked agency.
 */
@Injectable()
export class SupabaseUserGuard implements CanActivate {
  constructor(private readonly supabase: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedUserRequest>();
    const userId = await verifySupabaseToken(request, this.supabase);

    request.user = { userId };
    return true;
  }
}
