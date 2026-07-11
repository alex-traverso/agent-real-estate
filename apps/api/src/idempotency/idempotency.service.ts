import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../common/supabase/supabase.service';

/** Postgres unique_violation error code. */
const UNIQUE_VIOLATION = '23505';

/**
 * Dedup for inbound WhatsApp messages keyed by Meta's `message.id` (wamid),
 * persisted in `processed_messages` so state survives restarts. Meta can
 * redeliver the same webhook event; this is the barrier that keeps Luca from
 * replying twice, double-persisting the turn, or double-spending rate-limit
 * and Claude tokens for the same message. Called from WebhookService right
 * after tenant resolution, before the rate limit check.
 */
@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Returns true the first time (agencyId, messageId) is seen — the caller
   * should proceed — and false if it was already processed (Meta redelivery
   * — the caller should skip). The insert plus the UNIQUE(agency_id,
   * message_id) constraint is the atomic dedup barrier: on a concurrent
   * double-delivery, exactly one insert wins and the other gets a unique
   * violation.
   */
  async checkAndMark(agencyId: string, messageId: string): Promise<boolean> {
    const { error } = await this.supabase.client
      .from('processed_messages')
      .insert({ agency_id: agencyId, message_id: messageId });

    if (!error) {
      return true;
    }

    if (error.code === UNIQUE_VIOLATION) {
      return false;
    }

    // Fail open: a transient DB error should not drop a legitimate message.
    // Worst case is a duplicate reply, which is strictly better than silently
    // losing a message — matches the fail-soft posture used elsewhere.
    this.logger.error(
      `[IdempotencyService] Failed to record processed message | agencyId: ${agencyId} | error: ${error.message}`,
    );
    return true;
  }
}
