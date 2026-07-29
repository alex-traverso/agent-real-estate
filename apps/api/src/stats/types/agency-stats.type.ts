import type { Enums } from 'types';

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
  byOperation: Record<Enums<'operation_type'>, number>;
  byType: Record<Enums<'property_type'>, number>;
  /** Busiest neighborhoods first, capped at TOP_ZONES_LIMIT. */
  byZone: ZoneCount[];
  /**
   * Median asking price per currency, over available listings only. Median
   * rather than mean because a handful of high-end listings would drag an
   * average away from what the catalogue actually looks like. `null` when the
   * agency has no available listing in that currency.
   */
  medianPrice: Record<Enums<'currency_type'>, number | null>;
}

export interface LeadStats {
  total: number;
  byStatus: Record<Enums<'lead_status'>, number>;
  /** Exactly LEAD_TREND_DAYS points, oldest first, zero-filled. */
  last30Days: DailyCount[];
}

/** Payload of `GET /stats`, everything the admin dashboard home renders. */
export interface AgencyStats {
  properties: PropertyStats;
  leads: LeadStats;
}
