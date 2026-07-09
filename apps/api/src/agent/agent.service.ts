import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type { StoredMessage } from '../conversation/types/stored-message.type';
import { DEFAULT_AGENT_MODEL, MAX_OUTPUT_TOKENS } from './agent.constants';
import { SYSTEM_PROMPT } from './prompts/system.prompt';

/**
 * Luca — the Claude-powered conversational agent. Turns a conversation history
 * plus the client's latest message into Luca's reply.
 *
 * This is the core, tool-free version: it calls Claude with the versioned system
 * prompt and the mapped history. Tool calling (property search, lead save,
 * escalation) is layered on in Epic 6 Phase 4. The system prompt never contains
 * client-supplied text (prompt-injection surface, per CLAUDE.md).
 */
@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(configService: ConfigService) {
    // Fail fast on boot if the key is missing — a misconfigured agent should
    // crash at startup, not at the first client message.
    const apiKey = configService.getOrThrow<string>('ANTHROPIC_API_KEY');
    this.model =
      configService.get<string>('ANTHROPIC_MODEL') ?? DEFAULT_AGENT_MODEL;
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Produces Luca's reply to `userText`, given the prior conversation `history`
   * (which must NOT already include `userText`). History is mapped to the
   * Anthropic Messages shape — `timestamp`/`whatsapp_message_id` are dropped.
   * Throws on API failure so the caller (the webhook seam) can send a generic
   * fallback; the error is never surfaced to the client.
   */
  async processMessage(
    history: StoredMessage[],
    userText: string,
  ): Promise<string> {
    const messages: Anthropic.MessageParam[] = [
      ...history.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      { role: 'user', content: userText },
    ];

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: SYSTEM_PROMPT,
        messages,
      });

      return this.extractText(response);
    } catch (error) {
      this.logger.error(
        `[AgentService] Claude request failed | model: ${this.model} | error: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      throw error;
    }
  }

  /**
   * Concatenates the text blocks of a Claude response (non-text blocks are
   * ignored). Returns the trimmed reply text.
   */
  private extractText(response: Anthropic.Message): string {
    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();
  }
}
