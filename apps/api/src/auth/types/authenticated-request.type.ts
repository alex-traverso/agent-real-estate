import type { Request } from 'express';

/**
 * An Express request after SupabaseAuthGuard has run: the caller's identity
 * and resolved agency are attached, so controllers never re-derive them.
 */
export interface AuthenticatedRequest extends Request {
  auth: {
    userId: string;
    agencyId: string;
  };
}
