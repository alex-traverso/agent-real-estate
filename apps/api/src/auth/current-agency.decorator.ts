import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from './types/authenticated-request.type';

/**
 * Extracts the agency_id resolved by SupabaseAuthGuard. Requires the guard
 * to have run first (auth.agencyId is only set after a successful token +
 * agency_users lookup).
 */
export const CurrentAgency = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.auth.agencyId;
  },
);
