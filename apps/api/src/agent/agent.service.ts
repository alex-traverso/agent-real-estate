import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { PropertiesService } from '../properties/properties.service';
import { LeadsService } from '../leads/leads.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AgencyService } from '../agency/agency.service';
import type { StoredMessage } from '../conversation/types/stored-message.type';
import type { SaveLeadInput } from '../leads/types/lead-input.type';
import {
  DEFAULT_AGENT_MODEL,
  MAX_OUTPUT_TOKENS,
  MAX_TOOL_ITERATIONS,
} from './agent.constants';
import { SYSTEM_PROMPT } from './prompts/system.prompt';
import {
  ALL_TOOLS,
  TOOL_NAMES,
  type EscalateToAdvisorInput,
  type SaveLeadToolInput,
  type SearchByAddressInput,
  type SearchByFiltersInput,
  type SearchSemanticInput,
} from './tools';

/** Everything a tool needs from the conversation it runs in. */
export interface ProcessMessageInput {
  agencyId: string;
  conversationId: string;
  /** The client's WhatsApp number — the lead's phone, injected into save/escalate. */
  clientPhone: string;
  /** Prior turns, NOT including `userText`. */
  history: StoredMessage[];
  userText: string;
}

type ToolContext = Pick<
  ProcessMessageInput,
  'agencyId' | 'conversationId' | 'clientPhone'
>;

/**
 * Luca — the Claude-powered conversational agent. Runs the tool-calling loop:
 * Claude → tool_use → execute (property search / lead save / escalation) →
 * tool_result → Claude → … → final text.
 *
 * The system prompt never contains client-supplied text, and the lead's phone
 * is taken from the conversation context (never from Claude), per CLAUDE.md.
 * Tool failures return an error tool_result so Claude can escalate gracefully —
 * internal errors are never surfaced to the client.
 */
@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(
    configService: ConfigService,
    private readonly properties: PropertiesService,
    private readonly leads: LeadsService,
    private readonly notifications: NotificationsService,
    private readonly agency: AgencyService,
  ) {
    // Fail fast on boot if the key is missing — a misconfigured agent should
    // crash at startup, not at the first client message.
    const apiKey = configService.getOrThrow<string>('ANTHROPIC_API_KEY');
    this.model =
      configService.get<string>('ANTHROPIC_MODEL') ?? DEFAULT_AGENT_MODEL;
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Produces Luca's reply to `userText`. Drives the tool loop up to
   * `MAX_TOOL_ITERATIONS`; throws if the API fails or the loop never settles,
   * so the caller (the webhook seam) can send a generic fallback.
   */
  async processMessage(input: ProcessMessageInput): Promise<string> {
    const ctx: ToolContext = {
      agencyId: input.agencyId,
      conversationId: input.conversationId,
      clientPhone: input.clientPhone,
    };

    const messages: Anthropic.MessageParam[] = [
      ...input.history.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      { role: 'user', content: input.userText },
    ];

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const response = await this.createMessage(messages);

      if (response.stop_reason !== 'tool_use') {
        return this.extractText(response);
      }

      messages.push({ role: 'assistant', content: response.content });
      messages.push({
        role: 'user',
        content: await this.runToolCalls(response.content, ctx),
      });
    }

    // Claude kept requesting tools past the safety bound — treat as a failure
    // so the webhook sends the generic fallback rather than looping forever.
    this.logger.warn(
      `[AgentService] Max tool iterations reached | conversationId: ${ctx.conversationId}`,
    );
    throw new Error('Agent exceeded max tool iterations');
  }

  private async createMessage(
    messages: Anthropic.MessageParam[],
  ): Promise<Anthropic.Message> {
    try {
      return await this.client.messages.create({
        model: this.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: SYSTEM_PROMPT,
        messages,
        tools: ALL_TOOLS,
      });
    } catch (error) {
      this.logger.error(
        `[AgentService] Claude request failed | model: ${this.model} | error: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      throw error;
    }
  }

  /** Executes every tool_use block in a response, returning their tool_result blocks. */
  private async runToolCalls(
    content: Anthropic.ContentBlock[],
    ctx: ToolContext,
  ): Promise<Anthropic.ToolResultBlockParam[]> {
    const results: Anthropic.ToolResultBlockParam[] = [];

    for (const block of content) {
      if (block.type !== 'tool_use') {
        continue;
      }

      try {
        results.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: await this.executeTool(block, ctx),
        });
      } catch (error) {
        this.logger.error(
          `[AgentService] Tool execution failed | tool: ${block.name} | error: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
        results.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: 'The tool is temporarily unavailable.',
          is_error: true,
        });
      }
    }

    return results;
  }

  /** Dispatches a single tool call to its service and returns a JSON result string. */
  private async executeTool(
    block: Anthropic.ToolUseBlock,
    ctx: ToolContext,
  ): Promise<string> {
    switch (block.name) {
      case TOOL_NAMES.searchByFilters: {
        const input = block.input as SearchByFiltersInput;
        const results = await this.properties.searchByFilters(
          ctx.agencyId,
          input,
        );
        return JSON.stringify(results);
      }

      case TOOL_NAMES.searchSemantic: {
        const input = block.input as SearchSemanticInput;
        const results = await this.properties.searchSemantic(
          ctx.agencyId,
          input.queryText,
          input.operation,
          input.matchCount,
        );
        return JSON.stringify(results);
      }

      case TOOL_NAMES.searchByAddress: {
        const input = block.input as SearchByAddressInput;
        const results = await this.properties.searchByAddress(
          ctx.agencyId,
          input.address,
          input.zone,
        );
        return JSON.stringify(results);
      }

      case TOOL_NAMES.saveLead: {
        const lead = await this.leads.saveLead(
          ctx.agencyId,
          this.toSaveLeadInput(block.input as SaveLeadToolInput, ctx),
          ctx.conversationId,
        );
        return JSON.stringify({ saved: true, leadId: lead.id });
      }

      case TOOL_NAMES.escalateToAdvisor: {
        const input = block.input as EscalateToAdvisorInput;
        const lead = await this.leads.saveLead(
          ctx.agencyId,
          this.toSaveLeadInput(input, ctx, input.reason),
          ctx.conversationId,
        );
        const advisorEmail = await this.agency.getContactEmail(ctx.agencyId);
        if (advisorEmail) {
          await this.notifications.notifyAdvisor(advisorEmail, lead);
        } else {
          this.logger.warn(
            `[AgentService] No advisor email to notify | agencyId: ${ctx.agencyId} | leadId: ${lead.id}`,
          );
        }
        return JSON.stringify({ escalated: true, leadId: lead.id });
      }

      default:
        this.logger.warn(
          `[AgentService] Unknown tool requested: ${block.name}`,
        );
        return JSON.stringify({ error: 'unknown tool' });
    }
  }

  /**
   * Builds a SaveLeadInput from tool input, forcing `phone` to the conversation's
   * client number and folding an optional escalation `reason` into the notes.
   */
  private toSaveLeadInput(
    input: SaveLeadToolInput,
    ctx: ToolContext,
    reason?: string,
  ): SaveLeadInput {
    const notes =
      [input.notes, reason].filter(Boolean).join(' — ') || undefined;
    return {
      phone: ctx.clientPhone,
      name: input.name,
      budgetMin: input.budgetMin,
      budgetMax: input.budgetMax,
      currency: input.currency,
      operationType: input.operationType,
      preferredZone: input.preferredZone,
      rooms: input.rooms,
      propertyId: input.propertyId,
      notes,
    };
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
