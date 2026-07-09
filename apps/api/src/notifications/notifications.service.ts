import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import type { Tables } from 'types';
import {
  ADVISOR_NOTIFICATION_SUBJECT,
  DEFAULT_FROM_EMAIL,
} from './notifications.constants';

type Lead = Tables<'leads'>;

/**
 * Sends advisor notifications via Resend. Used by the agent's
 * `escalate_to_advisor` tool to alert a human when a lead is ready or the
 * conversation needs a person.
 *
 * Every send is **non-blocking**: any failure is logged and swallowed so an
 * email outage never blocks saving the lead or replying to the client. Only the
 * lead id is logged — never recipient address or lead PII.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly resend: Resend;
  private readonly fromEmail: string;

  constructor(configService: ConfigService) {
    // Fail fast on boot if the key is missing — a misconfigured mail client
    // should surface at startup, not at the first escalation.
    const apiKey = configService.getOrThrow<string>('RESEND_API_KEY');
    this.fromEmail =
      configService.get<string>('NOTIFICATIONS_FROM_EMAIL') ??
      DEFAULT_FROM_EMAIL;
    this.resend = new Resend(apiKey);
  }

  /**
   * Emails `recipientEmail` (the advisor) a summary of `lead`. Resolves even on
   * failure — the caller must not depend on delivery.
   */
  async notifyAdvisor(recipientEmail: string, lead: Lead): Promise<void> {
    try {
      const { error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: recipientEmail,
        subject: ADVISOR_NOTIFICATION_SUBJECT,
        html: this.buildBody(lead),
      });

      if (error) {
        this.logger.warn(
          `[NotificationsService] Advisor email not sent | leadId: ${lead.id} | error: ${error.message}`,
        );
        return;
      }

      this.logger.log(
        `[NotificationsService] Advisor notified | leadId: ${lead.id}`,
      );
    } catch (error) {
      this.logger.warn(
        `[NotificationsService] Advisor email failed | leadId: ${lead.id} | error: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }
  }

  /**
   * Builds the advisor email body. Content is Spanish (Argentine advisors, like
   * the admin UI); dynamic values are HTML-escaped since they originate from the
   * client conversation.
   */
  private buildBody(lead: Lead): string {
    const rows: string[] = [];
    const add = (label: string, value: string | number | null): void => {
      if (value === null || value === '') {
        return;
      }
      rows.push(
        `<li><strong>${label}:</strong> ${this.escapeHtml(String(value))}</li>`,
      );
    };

    add('Teléfono', lead.phone);
    add('Nombre', lead.name);
    add('Operación', lead.operation_type);
    add('Zona de interés', lead.preferred_zone);
    add('Ambientes', lead.rooms);
    add('Presupuesto', this.formatBudget(lead));
    add('Notas', lead.notes);

    return `<p>Luca calificó un nuevo lead y lo derivó para seguimiento.</p><ul>${rows.join(
      '',
    )}</ul>`;
  }

  private formatBudget(lead: Lead): string | null {
    if (lead.budget_min === null && lead.budget_max === null) {
      return null;
    }
    const currency = lead.currency ?? '';
    const min =
      lead.budget_min !== null ? `${currency} ${lead.budget_min}` : '';
    const max =
      lead.budget_max !== null ? `${currency} ${lead.budget_max}` : '';
    if (min && max) {
      return `${min} - ${max}`;
    }
    return min || max;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
