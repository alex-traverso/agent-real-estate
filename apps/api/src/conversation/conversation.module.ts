import { Module } from '@nestjs/common';
import { ConversationService } from './conversation.service';

/**
 * Provides conversation persistence. Exports ConversationService so the
 * webhook (and later the agent) can load and store message history.
 * SupabaseService is global, so no import is needed here.
 */
@Module({
  providers: [ConversationService],
  exports: [ConversationService],
})
export class ConversationModule {}
