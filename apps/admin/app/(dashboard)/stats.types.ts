import type { Enums } from "types";

/**
 * Local mirror of `apps/api/src/stats/types/agency-stats.type.ts`. The two
 * apps don't import each other, so the shape of `GET /stats` is duplicated
 * here rather than reaching into `apps/api/src` — same pattern as every other
 * inline-typed `apiGet<T>()` call in this app (see `leads/page.tsx`), just
 * factored into its own file because this shape is shared across several
 * dashboard-home components (tiles, charts, list).
 */

/** One bar in the zone breakdown. */
export interface ZoneCount {
  zone: string;
  count: number;
}

/** One point in the daily lead trend. `date` is `YYYY-MM-DD`. */
export interface DailyCount {
  date: string;
  count: number;
}

export interface PropertyStats {
  total: number;
  available: number;
  unavailable: number;
  byOperation: Record<Enums<"operation_type">, number>;
  byType: Record<Enums<"property_type">, number>;
  /** Busiest neighborhoods first, capped at the backend's top-zones limit. */
  byZone: ZoneCount[];
  /**
   * Median asking price per currency, over available listings only. `null`
   * when the agency has no available listing in that currency.
   */
  medianPrice: Record<Enums<"currency_type">, number | null>;
}

export interface LeadStats {
  total: number;
  byStatus: Record<Enums<"lead_status">, number>;
  /** Exactly 30 points, oldest first, zero-filled. */
  last30Days: DailyCount[];
}

/** Payload of `GET /stats`, everything the admin dashboard home renders. */
export interface AgencyStats {
  properties: PropertyStats;
  leads: LeadStats;
}
