import { Module } from '@nestjs/common';
import { EmbeddingsService } from './embeddings.service';

/**
 * Provides OpenAI-backed embedding generation. Exports EmbeddingsService so
 * the properties module (semantic search) can consume it. ConfigService is
 * global, so no import is needed here.
 */
@Module({
  providers: [EmbeddingsService],
  exports: [EmbeddingsService],
})
export class EmbeddingsModule {}
