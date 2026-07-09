import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

/**
 * Provides advisor notifications (Resend). Exports NotificationsService so the
 * agent's `escalate_to_advisor` tool (Epic 6/8) can consume it. The recipient
 * address is passed in by the caller (resolved via AgencyService), so no import
 * is needed here.
 */
@Module({
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
