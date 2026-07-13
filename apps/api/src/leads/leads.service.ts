import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Enums, Tables, TablesInsert } from 'types';
import { SupabaseService } from '../common/supabase/supabase.service';
import type { SaveLeadInput } from './types/lead-input.type';

type Lead = Tables<'leads'>;
type Conversation = Tables<'conversations'>;

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

  /**
   * Admin panel listing: every lead for the agency, optionally narrowed by
   * status, paginated and newest first.
   */
  async listForAdmin(
    agencyId: string,
    page: number,
    limit: number,
    status?: Enums<'lead_status'>,
  ): Promise<{ data: Lead[]; total: number }> {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = this.supabase.client
      .from('leads')
      .select('*', { count: 'exact' })
      .eq('agency_id', agencyId);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      this.logger.error(
        `[LeadsService] Admin list failed | agencyId: ${agencyId} | error: ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to list leads');
    }

    return { data: data ?? [], total: count ?? 0 };
  }

  /**
   * Admin panel single-lead lookup. Throws NotFoundException if the id
   * doesn't exist or belongs to another agency — the two cases are
   * indistinguishable to the caller by design.
   */
  async getByIdForAdmin(agencyId: string, id: string): Promise<Lead> {
    const { data, error } = await this.supabase.client
      .from('leads')
      .select('*')
      .eq('agency_id', agencyId)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      this.logger.error(
        `[LeadsService] Admin lookup failed | agencyId: ${agencyId} | error: ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to fetch lead');
    }

    if (!data) {
      throw new NotFoundException('Lead not found');
    }

    return data;
  }

  /**
   * The conversation that produced this lead, if any (a lead can exist
   * without one — e.g. created directly, outside the WhatsApp flow). Confirms
   * the lead exists and belongs to the agency first, so a missing lead is
   * reported as 404 rather than as an empty conversation.
   */
  async getConversationForLead(
    agencyId: string,
    leadId: string,
  ): Promise<Conversation | null> {
    await this.getByIdForAdmin(agencyId, leadId);

    const { data, error } = await this.supabase.client
      .from('conversations')
      .select('*')
      .eq('agency_id', agencyId)
      .eq('lead_id', leadId)
      .maybeSingle();

    if (error) {
      this.logger.error(
        `[LeadsService] Failed to fetch conversation for lead | agencyId: ${agencyId} | leadId: ${leadId} | error: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to fetch lead conversation',
      );
    }

    return data;
  }

  /**
   * Updates a lead's status. Confirms the lead exists first, so a genuine
   * DB failure on the update itself is never reported as a 404.
   */
  async updateStatus(
    agencyId: string,
    id: string,
    status: Enums<'lead_status'>,
  ): Promise<Lead> {
    await this.getByIdForAdmin(agencyId, id);

    const { data, error } = await this.supabase.client
      .from('leads')
      .update({ status })
      .eq('agency_id', agencyId)
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) {
      this.logger.error(
        `[LeadsService] Failed to update lead status | agencyId: ${agencyId} | leadId: ${id} | error: ${
          error?.message ?? 'no row returned'
        }`,
      );
      throw new InternalServerErrorException('Failed to update lead status');
    }

    return data;
  }
}
