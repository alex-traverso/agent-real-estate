import { Module } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';

/**
 * Provides the message dedup check. Exports IdempotencyService so the webhook
 * module can call it before the rate limit and any Claude-invoking path.
 * SupabaseService is global, so no import is needed here.
 */
@Module({
  providers: [IdempotencyService],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
