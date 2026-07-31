import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import type { Tables } from 'types';
import { SupabaseService } from '../common/supabase/supabase.service';
import type { CreateAgencyDto } from './dto/create-agency.dto';

/** Postgres unique_violation error code. */
const UNIQUE_VIOLATION = '23505';

type Agency = Tables<'agencies'>;

/**
 * Resolves which agency (tenant) an inbound WhatsApp message belongs to, and
 * (for the admin panel) which agency a Supabase Auth user belongs to — or
 * lets them create one if they have none yet (onboarding).
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

  /**
   * Returns the agency a Supabase Auth user belongs to, or `null` if they
   * have none yet — the admin panel's signal to redirect to onboarding
   * instead of the dashboard. Two queries (agency_users -> agencies) rather
   * than a nested select, matching this codebase's existing query style.
   */
  async findByUserId(userId: string): Promise<Agency | null> {
    const { data: agencyUser, error: membershipError } =
      await this.supabase.client
        .from('agency_users')
        .select('agency_id')
        .eq('user_id', userId)
        .maybeSingle();

    if (membershipError) {
      this.logger.error(
        `[AgencyService] Failed to resolve agency membership | userId: ${userId} | error: ${membershipError.message}`,
      );
      throw new InternalServerErrorException('Failed to resolve agency');
    }

    if (!agencyUser) {
      return null;
    }

    const { data: agency, error: agencyError } = await this.supabase.client
      .from('agencies')
      .select('*')
      .eq('id', agencyUser.agency_id)
      .maybeSingle();

    if (agencyError || !agency) {
      this.logger.error(
        `[AgencyService] Failed to load agency | agencyId: ${agencyUser.agency_id} | error: ${
          agencyError?.message ?? 'no row returned'
        }`,
      );
      throw new InternalServerErrorException('Failed to resolve agency');
    }

    return agency;
  }

  /**
   * Onboarding: creates an agency and links `userId` as its owner via the
   * create_agency_with_owner RPC, which does both inserts in one transaction
   * (see the migration) — a failed link can never leave an orphaned agency
   * behind. Unique-constraint violations are mapped to a Spanish, user-facing
   * ConflictException by constraint name; anything else is a generic 500.
   */
  async createForUser(userId: string, dto: CreateAgencyDto): Promise<Agency> {
    const { data, error } = await this.supabase.client.rpc(
      'create_agency_with_owner',
      {
        p_name: dto.name,
        p_email: dto.email,
        p_user_id: userId,
        ...(dto.phone ? { p_phone: dto.phone } : {}),
      },
    );

    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        if (error.message.includes('agency_users_user_id_key')) {
          throw new ConflictException('Ya tenés una inmobiliaria creada.');
        }
        if (error.message.includes('agencies_email_key')) {
          throw new ConflictException('Ese email ya está en uso.');
        }
      }

      this.logger.error(
        `[AgencyService] Failed to create agency | userId: ${userId} | error: ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to create agency');
    }

    if (!data) {
      this.logger.error(
        `[AgencyService] create_agency_with_owner returned no row | userId: ${userId}`,
      );
      throw new InternalServerErrorException('Failed to create agency');
    }

    return data;
  }
}
