import type { Request } from 'express';

/**
 * An Express request after SupabaseUserGuard has run: only the caller's
 * identity is attached — no agency, since this guard is used by the one
 * endpoint an agency-less user must be able to reach (agency onboarding).
 * Routes that need an agency use SupabaseAuthGuard + AuthenticatedRequest
 * instead.
 */
export interface AuthenticatedUserRequest extends Request {
  user: {
    userId: string;
  };
}
