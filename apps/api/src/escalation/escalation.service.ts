import { Injectable, Logger } from '@nestjs/common';
import type { Tables } from 'types';
import { LeadsService } from '../leads/leads.service';
import { AgencyService } from '../agency/agency.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { SaveLeadInput } from '../leads/types/lead-input.type';

type Lead = Tables<'leads'>;

/**
 * Composes the escalation path: save the lead, resolve the agency's advisor
 * email, and notify them. Shared by AgentService's `escalate_to_advisor` tool
 * and WebhookService's 50-message-cap handoff — one escalation path, not two.
 * Never throws on a missing/failed notification (NotificationsService is
 * itself non-blocking); only a failed lead save propagates.
 */
@Injectable()
export class EscalationService {
  private readonly logger = new Logger(EscalationService.name);

  constructor(
    private readonly leads: LeadsService,
    private readonly agency: AgencyService,
    private readonly notifications: NotificationsService,
  ) {}

  async escalate(
    agencyId: string,
    input: SaveLeadInput,
    conversationId?: string,
  ): Promise<Lead> {
    const lead = await this.leads.saveLead(agencyId, input, conversationId);

    const advisorEmail = await this.agency.getContactEmail(agencyId);
    if (advisorEmail) {
      await this.notifications.notifyAdvisor(advisorEmail, lead);
    } else {
      this.logger.warn(
        `[EscalationService] No advisor email to notify | agencyId: ${agencyId} | leadId: ${lead.id}`,
      );
    }

    return lead;
  }
}
