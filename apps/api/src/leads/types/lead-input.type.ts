import type { Enums } from 'types';

/**
 * Agent-facing input for creating a lead. Mirrors the app's camelCase
 * convention (like `PropertyFilters`); the service maps it to the snake_case
 * `leads` row. `agency_id`, `id`, `created_at` and `status` are not part of the
 * input — the tenant is passed separately and `status` defaults to `'new'`.
 *
 * Only `phone` is required (a lead we cannot contact is useless); everything
 * else is whatever the conversation surfaced.
 */
export interface SaveLeadInput {
  phone: string;
  name?: string;
  budgetMin?: number;
  budgetMax?: number;
  currency?: Enums<'currency_type'>;
  operationType?: Enums<'operation_type'>;
  preferredZone?: string;
  rooms?: number;
  propertyId?: string;
  notes?: string;
}
