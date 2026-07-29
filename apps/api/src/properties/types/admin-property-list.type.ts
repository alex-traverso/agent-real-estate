import type { Enums } from 'types';

/**
 * Columns the admin list can be ordered by. Whitelisted here (not just in the
 * DTO) because the value reaches PostgREST's `order` clause: validation is the
 * DTO's job, but the service must never forward an arbitrary column name.
 */
export const ADMIN_PROPERTY_SORT_COLUMNS = [
  'created_at',
  'price',
  'title',
] as const;

export type AdminPropertySortColumn =
  (typeof ADMIN_PROPERTY_SORT_COLUMNS)[number];

export type SortDirection = 'asc' | 'desc';

/**
 * Everything the admin properties list needs: pagination plus the optional
 * filters the panel's filter bar exposes. Unlike PropertyFilters (agent-facing,
 * available listings only), this one can also filter *by* availability, since
 * the admin sees unavailable properties too.
 */
export interface AdminPropertyListOptions {
  page: number;
  limit: number;
  /** Free text matched against title and address. */
  search?: string;
  zone?: string;
  operation?: Enums<'operation_type'>;
  type?: Enums<'property_type'>;
  available?: boolean;
  sort: AdminPropertySortColumn;
  order: SortDirection;
}
