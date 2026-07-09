import { Module } from '@nestjs/common';
import { PropertiesService } from './properties.service';

/**
 * Provides property search. Exports PropertiesService so the agent's search
 * tools (Epic 6) can consume it. SupabaseService is global, so no import is
 * needed here. Semantic search (EmbeddingsModule) is wired in Phase 3.
 */
@Module({
  providers: [PropertiesService],
  exports: [PropertiesService],
})
export class PropertiesModule {}
