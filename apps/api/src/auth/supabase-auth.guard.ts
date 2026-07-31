import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../common/supabase/supabase.service';
import { verifySupabaseToken } from './supabase-token.util';
import type { AuthenticatedRequest } from './types/authenticated-request.type';

/**
 * Authenticates admin panel requests: verifies the Supabase Auth access token
 * from the Authorization header, then resolves the caller's agency via
 * agency_users. Attaches { userId, agencyId } to the request so controllers
 * enforce agency_id without re-deriving it. This is the single security
 * boundary for every admin-facing route (CLAUDE.md: agency_id must never be
 * derived from user input).
 *
 * A user with no agency_users row is rejected here — that's the onboarding
 * case: SupabaseUserGuard is the variant that tolerates a missing agency, used
 * only by the agency-creation endpoint.
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseAuthGuard.name);

  constructor(private readonly supabase: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = await verifySupabaseToken(request, this.supabase);

    const { data: agencyUser, error: dbError } = await this.supabase.client
      .from('agency_users')
      .select('agency_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (dbError) {
      this.logger.error(
        `[SupabaseAuthGuard] Failed to resolve agency | userId: ${userId} | error: ${dbError.message}`,
      );
      throw new InternalServerErrorException();
    }

    if (!agencyUser) {
      this.logger.warn(
        `[SupabaseAuthGuard] Rejected request | reason: user has no linked agency | userId: ${userId}`,
      );
      throw new ForbiddenException();
    }

    request.auth = { userId, agencyId: agencyUser.agency_id };
    return true;
  }
}
