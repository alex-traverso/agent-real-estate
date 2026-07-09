import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../common/supabase/supabase.service';

/**
 * Resolves which agency (tenant) an inbound WhatsApp message belongs to.
 *
 * The webhook payload carries `metadata.phone_number_id` (the business number
 * that received the message); the agency that owns that number is looked up
 * via `agencies.whatsapp_phone_number_id`. The mapping is stable, so results
 * are cached in-process to avoid a DB round-trip on every message.
 */
@Injectable()
export class AgencyService {
  private readonly logger = new Logger(AgencyService.name);
  private readonly cache = new Map<string, string>();
  private readonly emailCache = new Map<string, string>();

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Returns the agency id for a WhatsApp `phone_number_id`, or `null` if no
   * agency is registered for it (the caller must skip processing — an
   * unattributable message must never be answered or persisted).
   */
  async resolveIdByPhoneNumberId(
    phoneNumberId: string,
  ): Promise<string | null> {
    const cached = this.cache.get(phoneNumberId);
    if (cached) {
      return cached;
    }

    const { data, error } = await this.supabase.client
      .from('agencies')
      .select('id')
      .eq('whatsapp_phone_number_id', phoneNumberId)
      .maybeSingle();

    if (error) {
      this.logger.error(
        `[AgencyService] Failed to resolve agency | phoneNumberId: ${phoneNumberId} | error: ${error.message}`,
      );
      return null;
    }

    if (!data) {
      this.logger.error(
        `[AgencyService] No agency registered for phone_number_id: ${phoneNumberId}`,
      );
      return null;
    }

    this.cache.set(phoneNumberId, data.id);
    return data.id;
  }

  /**
   * Returns the agency's contact email — the advisor address notified on
   * escalation — or `null` if the agency has none or cannot be found. Cached
   * in-process like the phone-number resolution, since it rarely changes.
   */
  async getContactEmail(agencyId: string): Promise<string | null> {
    const cached = this.emailCache.get(agencyId);
    if (cached) {
      return cached;
    }

    const { data, error } = await this.supabase.client
      .from('agencies')
      .select('email')
      .eq('id', agencyId)
      .maybeSingle();

    if (error) {
      this.logger.error(
        `[AgencyService] Failed to load agency email | agencyId: ${agencyId} | error: ${error.message}`,
      );
      return null;
    }

    if (!data?.email) {
      this.logger.error(
        `[AgencyService] No contact email registered for agency: ${agencyId}`,
      );
      return null;
    }

    this.emailCache.set(agencyId, data.email);
    return data.email;
  }
}
