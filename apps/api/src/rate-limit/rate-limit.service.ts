import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../common/supabase/supabase.service';
import {
  RATE_LIMIT_MAX_MESSAGES,
  RATE_LIMIT_WINDOW_MS,
} from './rate-limit.constants';

/**
 * Fixed-window rate limiter per (agency_id, phone), persisted in the
 * `rate_limits` table so state survives restarts (per CLAUDE.md / ARCHITECTURE.md).
 * This is the first cost/spam barrier — called from WebhookService before any
 * ConversationService or AgentService (Claude) call. It is a plain injectable,
 * not a NestJS Guard: the phone and agency_id are only known deep inside
 * WebhookService.processInbound (after per-message tenant resolution), past
 * the point where a CanActivate guard could intervene.
 */
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Returns true if the message may proceed, false if the phone has hit the
   * limit for the current window. One row per (agency_id, phone) is upserted
   * in place — window resets overwrite the same row, so there is nothing to
   * periodically clean up.
   */
  async checkAndIncrement(agencyId: string, phone: string): Promise<boolean> {
    const { data: existing, error } = await this.supabase.client
      .from('rate_limits')
      .select('*')
      .eq('agency_id', agencyId)
      .eq('phone', phone)
      .maybeSingle();

    if (error) {
      this.logger.error(
        `[RateLimitService] Failed to read rate limit state | agencyId: ${agencyId} | error: ${error.message}`,
      );
      // Fail open: a transient DB error should not hard-block legitimate
      // traffic — matches the fail-soft posture used elsewhere (agent
      // failures fall back to a generic reply rather than dropping silently).
      return true;
    }

    const now = Date.now();
    const windowExpired =
      !existing ||
      now - new Date(existing.window_start).getTime() > RATE_LIMIT_WINDOW_MS;

    if (windowExpired) {
      await this.upsertWindow(agencyId, phone, new Date(now).toISOString(), 1);
      return true;
    }

    const currentCount = existing.message_count ?? 0;
    if (currentCount >= RATE_LIMIT_MAX_MESSAGES) {
      this.logger.warn(
        `[RateLimitService] Rate limit exceeded | agencyId: ${agencyId}`,
      );
      return false;
    }

    await this.upsertWindow(
      agencyId,
      phone,
      existing.window_start,
      currentCount + 1,
    );
    return true;
  }

  private async upsertWindow(
    agencyId: string,
    phone: string,
    windowStart: string,
    messageCount: number,
  ): Promise<void> {
    const { error } = await this.supabase.client.from('rate_limits').upsert(
      {
        agency_id: agencyId,
        phone,
        window_start: windowStart,
        message_count: messageCount,
      },
      { onConflict: 'agency_id,phone' },
    );

    if (error) {
      this.logger.error(
        `[RateLimitService] Failed to persist rate limit state | agencyId: ${agencyId} | error: ${error.message}`,
      );
    }
  }
}
