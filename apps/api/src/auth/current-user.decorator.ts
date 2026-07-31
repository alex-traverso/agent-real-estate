import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUserRequest } from './types/authenticated-user-request.type';

/**
 * Extracts the userId resolved by SupabaseUserGuard. Requires that guard to
 * have run first (request.user is only set after a successful token check).
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedUserRequest>();
    return request.user.userId;
  },
);
