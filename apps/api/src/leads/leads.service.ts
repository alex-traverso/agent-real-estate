import { Injectable, Logger } from '@nestjs/common';
import type { Tables, TablesInsert } from 'types';
import { SupabaseService } from '../common/supabase/supabase.service';
import type { SaveLeadInput } from './types/lead-input.type';

type Lead = Tables<'leads'>;

/**
 * Persists qualified leads to the `leads` table. Agent-facing: the `save_lead`
 * and `escalate_to_advisor` tools call it. Every query is scoped by
 * `agency_id` (multi-tenancy, per CLAUDE.md); on failure it logs and throws a
 * generic error so the agent can escalate without leaking DB internals.
 */
@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Inserts a lead for `agencyId` and returns the created row. `status`
   * defaults to `'new'`. When `conversationId` is given, the originating
   * conversation is linked to the lead (`conversations.lead_id`) on a
   * best-effort basis — a failed link never loses the already-saved lead.
   */
  async saveLead(
    agencyId: string,
    input: SaveLeadInput,
    conversationId?: string,
  ): Promise<Lead> {
    if (!input.phone?.trim()) {
      throw new Error('Missing required lead field: phone');
    }

    const insert: TablesInsert<'leads'> = {
      agency_id: agencyId,
      phone: input.phone,
      name: input.name ?? null,
      budget_min: input.budgetMin ?? null,
      budget_max: input.budgetMax ?? null,
      currency: input.currency ?? null,
      operation_type: input.operationType ?? null,
      preferred_zone: input.preferredZone ?? null,
      rooms: input.rooms ?? null,
      property_id: input.propertyId ?? null,
      notes: input.notes ?? null,
      status: 'new',
    };

    const { data, error } = await this.supabase.client
      .from('leads')
      .insert(insert)
      .select('*')
      .single();

    if (error || !data) {
      this.logger.error(
        `[LeadsService] Failed to save lead | agencyId: ${agencyId} | error: ${
          error?.message ?? 'no row returned'
        }`,
      );
      throw new Error('Failed to save lead');
    }

    if (conversationId) {
      await this.linkConversation(conversationId, agencyId, data.id);
    }

    return data;
  }

  /**
   * Best-effort link of a conversation to its lead. Scoped by `agency_id`; a
   * failure is logged but not thrown — the lead is already persisted.
   */
  private async linkConversation(
    conversationId: string,
    agencyId: string,
    leadId: string,
  ): Promise<void> {
    const { error } = await this.supabase.client
      .from('conversations')
      .update({ lead_id: leadId, updated_at: new Date().toISOString() })
      .eq('id', conversationId)
      .eq('agency_id', agencyId);

    if (error) {
      this.logger.warn(
        `[LeadsService] Failed to link conversation to lead | conversationId: ${conversationId} | leadId: ${leadId} | error: ${error.message}`,
      );
    }
  }
}
