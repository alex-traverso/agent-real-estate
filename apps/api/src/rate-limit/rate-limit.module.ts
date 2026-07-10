import { Module } from '@nestjs/common';
import { RateLimitService } from './rate-limit.service';

/**
 * Provides the rate-limiting check. Exports RateLimitService so the webhook
 * module can call it before any Claude-invoking path. SupabaseService is
 * global, so no import is needed here.
 */
@Module({
  providers: [RateLimitService],
  exports: [RateLimitService],
})
export class RateLimitModule {}
