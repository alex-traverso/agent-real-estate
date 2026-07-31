import { Module } from '@nestjs/common';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { AuthModule } from '../auth/auth.module';
import { PropertiesService } from './properties.service';
import { PropertiesController } from './properties.controller';

/**
 * Provides property search and the admin CRUD controller. Exports
 * PropertiesService so the agent's search tools (Epic 6) can consume it.
 * SupabaseService is global; EmbeddingsModule is imported for the semantic
 * search / embedding-generation paths; AuthModule for SupabaseAuthGuard.
 */
@Module({
  imports: [EmbeddingsModule, AuthModule],
  controllers: [PropertiesController],
  providers: [PropertiesService],
  exports: [PropertiesService],
})
export class PropertiesModule {}
