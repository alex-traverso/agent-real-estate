/** How many neighborhoods the zone breakdown returns, busiest first. */
export const TOP_ZONES_LIMIT = 8;

/** Length of the lead-trend series, in days, ending today. */
export const LEAD_TREND_DAYS = 30;

/**
 * Timezone the daily lead buckets are grouped by. `created_at` is a
 * timestamptz, so without this the series would break on UTC midnight and an
 * evening lead would land on the next day for an advisor in Argentina, which is
 * the only audience this panel has (CLAUDE.md).
 */
export const REPORTING_TIME_ZONE = 'America/Argentina/Buenos_Aires';
