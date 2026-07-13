import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseService } from '../common/supabase/supabase.service';
import type { AuthenticatedRequest } from './types/authenticated-request.type';

const BEARER_PREFIX = 'Bearer ';

/**
 * Authenticates admin panel requests: verifies the Supabase Auth access token
 * from the Authorization header, then resolves the caller's agency via
 * agency_users. Attaches { userId, agencyId } to the request so controllers
 * enforce agency_id without re-deriving it. This is the single security
 * boundary for every admin-facing route (CLAUDE.md: agency_id must never be
 * derived from user input).
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseAuthGuard.name);

  constructor(private readonly supabase: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const token = this.extractToken(request);
    if (!token) {
      this.logger.warn(
        '[SupabaseAuthGuard] Rejected request | reason: missing or malformed Authorization header',
      );
      throw new UnauthorizedException();
    }

    const {
      data: { user },
      error: authError,
    } = await this.supabase.client.auth.getUser(token);

    if (authError || !user) {
      this.logger.warn(
        '[SupabaseAuthGuard] Rejected request | reason: invalid or expired token',
      );
      throw new UnauthorizedException();
    }

    const { data: agencyUser, error: dbError } = await this.supabase.client
      .from('agency_users')
      .select('agency_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (dbError) {
      this.logger.error(
        `[SupabaseAuthGuard] Failed to resolve agency | userId: ${user.id} | error: ${dbError.message}`,
      );
      throw new InternalServerErrorException();
    }

    if (!agencyUser) {
      this.logger.warn(
        `[SupabaseAuthGuard] Rejected request | reason: user has no linked agency | userId: ${user.id}`,
      );
      throw new ForbiddenException();
    }

    request.auth = { userId: user.id, agencyId: agencyUser.agency_id };
    return true;
  }

  private extractToken(request: AuthenticatedRequest): string | null {
    const header = request.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith(BEARER_PREFIX)) {
      return null;
    }
    const token = header.slice(BEARER_PREFIX.length).trim();
    return token.length > 0 ? token : null;
  }
}
