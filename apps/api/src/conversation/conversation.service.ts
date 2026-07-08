import { Injectable, Logger } from '@nestjs/common';
import type { Json, Tables } from 'types';
import { SupabaseService } from '../common/supabase/supabase.service';
import { SESSION_TIMEOUT_MS } from './conversation.constants';
import type { StoredMessage } from './types/stored-message.type';

type Conversation = Tables<'conversations'>;

/**
 * Loads and persists WhatsApp conversation history in the `conversations`
 * table (one row per active session per phone). Every query is scoped by
 * `agency_id` (multi-tenancy, per CLAUDE.md). History is stored as an array
 * of StoredMessage in the `messages` JSONB column.
 */
@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Returns the active conversation for (agencyId, phone), creating a new one
   * when none exists or the previous session has been idle past the timeout.
   * A stale active conversation is closed before a fresh one is opened.
   */
  async getOrCreateActive(
    agencyId: string,
    phone: string,
  ): Promise<Conversation> {
    const { data: existing, error } = await this.supabase.client
      .from('conversations')
      .select('*')
      .eq('agency_id', agencyId)
      .eq('phone', phone)
      .eq('status', 'active')
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      this.logger.error(
        `[ConversationService] Failed to load conversation | agencyId: ${agencyId} | error: ${error.message}`,
      );
      throw new Error('Failed to load conversation');
    }

    if (existing && !this.isExpired(existing.last_message_at)) {
      return existing;
    }

    if (existing) {
      // Idle past the session timeout: close it so a fresh session starts.
      await this.close(existing.id, agencyId);
    }

    return this.create(agencyId, phone);
  }

  /**
   * Appends messages to a conversation and bumps its counters. Returns the
   * updated row so callers can chain further appends without re-reading.
   */
  async appendMessages(
    conversation: Conversation,
    newMessages: StoredMessage[],
  ): Promise<Conversation> {
    const existing =
      (conversation.messages as unknown as StoredMessage[]) ?? [];
    const merged = [...existing, ...newMessages];
    const now = new Date().toISOString();

    const { data, error } = await this.supabase.client
      .from('conversations')
      .update({
        // Our typed StoredMessage[] is stored as-is in the JSONB column.
        messages: merged as unknown as Json,
        message_count: (conversation.message_count ?? 0) + newMessages.length,
        last_message_at: now,
        updated_at: now,
      })
      .eq('id', conversation.id)
      .eq('agency_id', conversation.agency_id)
      .select('*')
      .single();

    if (error || !data) {
      this.logger.error(
        `[ConversationService] Failed to append messages | conversationId: ${conversation.id} | error: ${error?.message ?? 'no row returned'}`,
      );
      throw new Error('Failed to append messages');
    }

    return data;
  }

  private async create(agencyId: string, phone: string): Promise<Conversation> {
    const { data, error } = await this.supabase.client
      .from('conversations')
      .insert({
        agency_id: agencyId,
        phone,
        messages: [],
        message_count: 0,
        status: 'active',
      })
      .select('*')
      .single();

    if (error || !data) {
      this.logger.error(
        `[ConversationService] Failed to create conversation | agencyId: ${agencyId} | error: ${error?.message ?? 'no row returned'}`,
      );
      throw new Error('Failed to create conversation');
    }

    return data;
  }

  private async close(conversationId: string, agencyId: string): Promise<void> {
    // Best-effort: closing a stale session must not block the new one.
    const { error } = await this.supabase.client
      .from('conversations')
      .update({ status: 'closed', updated_at: new Date().toISOString() })
      .eq('id', conversationId)
      .eq('agency_id', agencyId);

    if (error) {
      this.logger.warn(
        `[ConversationService] Failed to close stale conversation | conversationId: ${conversationId} | error: ${error.message}`,
      );
    }
  }

  private isExpired(lastMessageAt: string | null): boolean {
    if (!lastMessageAt) {
      return false;
    }
    return Date.now() - new Date(lastMessageAt).getTime() > SESSION_TIMEOUT_MS;
  }
}
