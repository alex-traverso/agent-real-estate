import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { DEFAULT_EMBEDDING_MODEL } from './embeddings.constants';

/**
 * Generates vector embeddings via OpenAI. Semantic property search uses it to
 * turn a client's free-text description ("algo tranquilo con jardín") into a
 * 1536-dim vector comparable, via pgvector cosine distance, against the
 * property embeddings produced from `buildPropertyEmbeddingInput`.
 *
 * Intentionally generic: it knows nothing about properties or the agent, so
 * any consumer that needs an embedding can reuse it.
 */
@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(configService: ConfigService) {
    // Fail fast on boot if the key is missing — a misconfigured embeddings
    // client should crash the app, not silently fail at the first query.
    const apiKey = configService.getOrThrow<string>('OPENAI_API_KEY');
    this.model =
      configService.get<string>('OPENAI_EMBEDDING_MODEL') ??
      DEFAULT_EMBEDDING_MODEL;
    this.client = new OpenAI({ apiKey });
  }

  /**
   * Returns the embedding vector for `text`. Throws on API failure so the
   * caller (search service / agent) can decide how to degrade. The input is
   * never logged in full — only its length — since it can be a client message.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: text,
      });
      const vector = response.data[0]?.embedding;
      if (!vector) {
        throw new Error('OpenAI returned an empty embedding');
      }
      return vector;
    } catch (error) {
      this.logger.error(
        `[EmbeddingsService] Failed to generate embedding | model: ${
          this.model
        } | length: ${text.length} | error: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      throw error;
    }
  }
}
