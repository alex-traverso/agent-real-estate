import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Constants, type Enums } from 'types';
import { SupabaseService } from '../common/supabase/supabase.service';
import {
  LEAD_TREND_DAYS,
  REPORTING_TIME_ZONE,
  TOP_ZONES_LIMIT,
} from './stats.constants';
import type {
  AgencyStats,
  DailyCount,
  LeadStats,
  PropertyStats,
  ZoneCount,
} from './types/agency-stats.type';

type PropertyStatsRow = {
  available: boolean | null;
  operation: Enums<'operation_type'>;
  type: Enums<'property_type'>;
  zone: string;
  price: number;
  currency: Enums<'currency_type'>;
};

type LeadStatsRow = {
  status: Enums<'lead_status'> | null;
  created_at: string | null;
};

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Dashboard metrics for a single agency.
 *
 * Aggregation happens in Node over two narrow, `agency_id`-scoped selects
 * rather than in Postgres. At the volumes this product runs at (one agency's
 * catalogue and lead list) that is a single round trip each and keeps the
 * breakdowns testable without a database; if an agency ever outgrows it, the
 * two private fetches are the only thing that has to become an RPC — the
 * response shape stays put.
 */
@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async getAgencyStats(agencyId: string): Promise<AgencyStats> {
    const [properties, leads] = await Promise.all([
      this.fetchProperties(agencyId),
      this.fetchLeads(agencyId),
    ]);

    return {
      properties: this.summarizeProperties(properties),
      leads: this.summarizeLeads(leads),
    };
  }

  private async fetchProperties(agencyId: string): Promise<PropertyStatsRow[]> {
    const { data, error } = await this.supabase.client
      .from('properties')
      .select('available, operation, type, zone, price, currency')
      .eq('agency_id', agencyId);

    if (error) {
      this.logger.error(
        `[StatsService] Failed to load property stats | agencyId: ${agencyId} | error: ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to load statistics');
    }

    return data ?? [];
  }

  private async fetchLeads(agencyId: string): Promise<LeadStatsRow[]> {
    const { data, error } = await this.supabase.client
      .from('leads')
      .select('status, created_at')
      .eq('agency_id', agencyId);

    if (error) {
      this.logger.error(
        `[StatsService] Failed to load lead stats | agencyId: ${agencyId} | error: ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to load statistics');
    }

    return data ?? [];
  }

  private summarizeProperties(rows: PropertyStatsRow[]): PropertyStats {
    const byOperation = this.emptyCounter(
      Constants.public.Enums.operation_type,
    );
    const byType = this.emptyCounter(Constants.public.Enums.property_type);
    const zoneCounts = new Map<string, number>();
    const availablePrices = this.emptyPriceBuckets();

    let available = 0;

    for (const row of rows) {
      // `available` is nullable in the schema even though it defaults to true.
      // Counting only an explicit `true` matches what the agent's searches do
      // (`.eq('available', true)` excludes NULL), so the panel and the agent
      // never disagree about how many listings are live.
      const isAvailable = row.available === true;
      if (isAvailable) {
        available += 1;
        availablePrices[row.currency].push(row.price);
      }

      byOperation[row.operation] += 1;
      byType[row.type] += 1;
      zoneCounts.set(row.zone, (zoneCounts.get(row.zone) ?? 0) + 1);
    }

    return {
      total: rows.length,
      available,
      unavailable: rows.length - available,
      byOperation,
      byType,
      byZone: this.topZones(zoneCounts),
      medianPrice: {
        ARS: this.median(availablePrices.ARS),
        USD: this.median(availablePrices.USD),
      },
    };
  }

  private summarizeLeads(rows: LeadStatsRow[]): LeadStats {
    const byStatus = this.emptyCounter(Constants.public.Enums.lead_status);
    const dayCounts = new Map<string, number>();

    for (const row of rows) {
      // Same reasoning as `available` above: the column defaults to 'new', so a
      // NULL is read as 'new' and byStatus keeps summing to `total`.
      byStatus[row.status ?? 'new'] += 1;

      if (row.created_at) {
        const day = this.toReportingDay(new Date(row.created_at));
        dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
      }
    }

    return {
      total: rows.length,
      byStatus,
      last30Days: this.buildTrend(dayCounts),
    };
  }

  /** A zeroed counter keyed by every member of an enum, so no key is missing. */
  private emptyCounter<T extends string>(
    values: readonly T[],
  ): Record<T, number> {
    return Object.fromEntries(values.map((value) => [value, 0])) as Record<
      T,
      number
    >;
  }

  private emptyPriceBuckets(): Record<Enums<'currency_type'>, number[]> {
    return { ARS: [], USD: [] };
  }

  /** Busiest zones first; ties break alphabetically so the order is stable. */
  private topZones(counts: Map<string, number>): ZoneCount[] {
    return [...counts.entries()]
      .map(([zone, count]) => ({ zone, count }))
      .sort((a, b) => b.count - a.count || a.zone.localeCompare(b.zone))
      .slice(0, TOP_ZONES_LIMIT);
  }

  private median(values: number[]): number | null {
    if (values.length === 0) {
      return null;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);

    return sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];
  }

  /**
   * Zero-fills the trend so the chart always plots LEAD_TREND_DAYS points
   * ending today, instead of collapsing quiet stretches into a straight line
   * between two distant days.
   */
  private buildTrend(dayCounts: Map<string, number>): DailyCount[] {
    const today = Date.now();
    const series: DailyCount[] = [];

    for (let offset = LEAD_TREND_DAYS - 1; offset >= 0; offset -= 1) {
      const date = this.toReportingDay(
        new Date(today - offset * MILLISECONDS_PER_DAY),
      );
      series.push({ date, count: dayCounts.get(date) ?? 0 });
    }

    return series;
  }

  /** Formats an instant as `YYYY-MM-DD` in the agency's reporting timezone. */
  private toReportingDay(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: REPORTING_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
}
