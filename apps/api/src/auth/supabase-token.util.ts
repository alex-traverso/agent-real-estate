import { Logger, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { SupabaseService } from '../common/supabase/supabase.service';

const BEARER_PREFIX = 'Bearer ';
const logger = new Logger('SupabaseTokenUtil');

/**
 * Extracts and verifies the Supabase Auth access token from a request's
 * Authorization header, returning the caller's user id. Shared by every
 * admin-facing guard (SupabaseAuthGuard, SupabaseUserGuard) so token
 * verification never diverges between them — only what each guard requires
 * beyond identity (e.g. an agency) differs.
 */
export async function verifySupabaseToken(
  request: Request,
  supabase: SupabaseService,
): Promise<string> {
  const token = extractToken(request);
  if (!token) {
    logger.warn(
      '[SupabaseTokenUtil] Rejected request | reason: missing or malformed Authorization header',
    );
    throw new UnauthorizedException();
  }

  const {
    data: { user },
    error,
  } = await supabase.client.auth.getUser(token);

  if (error || !user) {
    logger.warn(
      '[SupabaseTokenUtil] Rejected request | reason: invalid or expired token',
    );
    throw new UnauthorizedException();
  }

  return user.id;
}

function extractToken(request: Request): string | null {
  const header = request.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith(BEARER_PREFIX)) {
    return null;
  }
  const token = header.slice(BEARER_PREFIX.length).trim();
  return token.length > 0 ? token : null;
}
