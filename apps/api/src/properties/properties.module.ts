import { Module } from '@nestjs/common';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { PropertiesService } from './properties.service';

/**
 * Provides property search. Exports PropertiesService so the agent's search
 * tools (Epic 6) can consume it. SupabaseService is global; EmbeddingsModule is
 * imported for the semantic search path.
 */
@Module({
  imports: [EmbeddingsModule],
  providers: [PropertiesService],
  exports: [PropertiesService],
})
export class PropertiesModule {}
