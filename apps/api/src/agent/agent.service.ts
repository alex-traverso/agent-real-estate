import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { PropertiesService } from '../properties/properties.service';
import { LeadsService } from '../leads/leads.service';
import { EscalationService } from '../escalation/escalation.service';
import type { StoredMessage } from '../conversation/types/stored-message.type';
import type { TokenUsage } from '../conversation/types/token-usage.type';
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

/**
 * Luca's reply plus the token usage accumulated while producing it (summed
 * across every Claude call the tool loop made this turn). The caller persists
 * `usage` onto the conversation for cost-per-lead visibility.
 */
export interface ProcessMessageResult {
  reply: string;
  usage: TokenUsage;
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

  /**
   * System prompt as a single cached block. Tools render before `system` in
   * the API's prompt layout, so one breakpoint here caches tools + system
   * together — no separate breakpoint is needed on the tools array.
   */
  private readonly systemBlocks: Anthropic.TextBlockParam[] = [
    {
      type: 'text',
      text: SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' },
    },
  ];

  constructor(
    configService: ConfigService,
    private readonly properties: PropertiesService,
    private readonly leads: LeadsService,
    private readonly escalation: EscalationService,
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
  async processMessage(
    input: ProcessMessageInput,
  ): Promise<ProcessMessageResult> {
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

    // Running total across every Claude call this turn makes (the tool loop can
    // call the API multiple times); the caller persists it onto the conversation.
    const usage: TokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    };

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const response = await this.createMessage(messages, ctx.conversationId);
      this.accumulateUsage(usage, response.usage);

      if (response.stop_reason !== 'tool_use') {
        return { reply: this.extractText(response), usage };
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

  /**
   * Calls the Claude Messages API. Thinking is explicitly disabled: Luca's
   * replies are short and conversational, and leaving `thinking` unset would
   * silently start costing thinking tokens if `ANTHROPIC_MODEL` is ever
   * pointed at a model where adaptive thinking is the on-by-default behavior
   * (e.g. Sonnet 5) — an explicit `disabled` protects the cost budget across
   * a future model swap.
   */
  private async createMessage(
    messages: Anthropic.MessageParam[],
    conversationId: string,
  ): Promise<Anthropic.Message> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: this.systemBlocks,
        messages: this.withHistoryCacheBreakpoint(messages),
        tools: ALL_TOOLS,
        // tool_choice intentionally left unset (defaults to "auto"): Luca must
        // be able to reply with plain text (e.g. a greeting) without being
        // forced to call a tool.
        thinking: { type: 'disabled' },
      });
      this.logUsage(conversationId, response.usage);
      return response;
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
   * Marks the last content block of the second-to-last message with a cache
   * breakpoint, so every prior turn is served from cache and only the newest
   * turn (plus the model's new response) is billed as fresh input. Returns a
   * new array — the caller's `messages` (persisted/mutated across the tool
   * loop) is left untouched.
   */
  private withHistoryCacheBreakpoint(
    messages: Anthropic.MessageParam[],
  ): Anthropic.MessageParam[] {
    if (messages.length < 2) {
      // No prior turn to cache yet — marking the only message would just add
      // a cache-write cost with no read to offset it.
      return messages;
    }

    const targetIndex = messages.length - 2;
    const target = messages[targetIndex];
    const blocks = this.toContentBlocks(target.content);
    const lastIndex = blocks.length - 1;
    const cachedBlocks = [...blocks];
    cachedBlocks[lastIndex] = {
      ...cachedBlocks[lastIndex],
      cache_control: { type: 'ephemeral' },
    } as Anthropic.ContentBlockParam;

    const result = [...messages];
    result[targetIndex] = { ...target, content: cachedBlocks };
    return result;
  }

  private toContentBlocks(
    content: Anthropic.MessageParam['content'],
  ): Anthropic.ContentBlockParam[] {
    if (typeof content === 'string') {
      return [{ type: 'text', text: content }];
    }
    return content;
  }

  /**
   * Logs token usage per Claude call so cache effectiveness and per-message
   * cost are visible in production. Never logs phone numbers or message
   * content (per CLAUDE.md) — only counts and the conversation id.
   */
  private logUsage(conversationId: string, usage: Anthropic.Usage): void {
    this.logger.log(
      `[AgentService] Token usage | conversationId: ${conversationId} | ` +
        `in: ${usage.input_tokens} | out: ${usage.output_tokens} | ` +
        `cacheWrite: ${usage.cache_creation_input_tokens ?? 0} | ` +
        `cacheRead: ${usage.cache_read_input_tokens ?? 0}`,
    );
  }

  /**
   * Adds one Claude call's usage into the running per-turn total. Cache fields
   * are `?? 0` (absent when nothing was cached), same guard as logUsage.
   */
  private accumulateUsage(total: TokenUsage, usage: Anthropic.Usage): void {
    total.inputTokens += usage.input_tokens;
    total.outputTokens += usage.output_tokens;
    total.cacheCreationTokens += usage.cache_creation_input_tokens ?? 0;
    total.cacheReadTokens += usage.cache_read_input_tokens ?? 0;
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
      case TOOL_NAMES.listAvailableZones: {
        const zones = await this.properties.listAvailableZones(ctx.agencyId);
        return JSON.stringify(zones);
      }

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
        const lead = await this.escalation.escalate(
          ctx.agencyId,
          this.toSaveLeadInput(input, ctx, input.reason),
          ctx.conversationId,
        );
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
