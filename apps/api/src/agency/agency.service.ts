import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import type { Tables, TablesUpdate } from 'types';
import { SupabaseService } from '../common/supabase/supabase.service';
import { AGENCY_CACHE_TTL_MS } from './agency.constants';
import type { CreateAgencyDto } from './dto/create-agency.dto';
import type { UpdateAgencyDto } from './dto/update-agency.dto';

/** Postgres unique_violation error code. */
const UNIQUE_VIOLATION = '23505';

type Agency = Tables<'agencies'>;
type AgencyUpdate = TablesUpdate<'agencies'>;

/** A cached value and the timestamp after which it must be re-read. */
type CacheEntry<T> = { value: T; expiresAt: number };

/**
 * Resolves which agency (tenant) an inbound WhatsApp message belongs to, and
 * (for the admin panel) which agency a Supabase Auth user belongs to — or
 * lets them create one if they have none yet (onboarding).
 *
 * The webhook payload carries `metadata.phone_number_id` (the business number
 * that received the message); the agency that owns that number is looked up
 * via `agencies.whatsapp_phone_number_id`. That mapping is hit on every
 * inbound message and changes rarely, so results are cached in-process — but
 * only for AGENCY_CACHE_TTL_MS, because an agency can edit the number from the
 * settings screen (see agency.constants.ts for why the TTL is not optional).
 */
@Injectable()
export class AgencyService {
  private readonly logger = new Logger(AgencyService.name);
  private readonly cache = new Map<string, CacheEntry<string>>();
  private readonly emailCache = new Map<string, CacheEntry<string>>();

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Returns the agency id for a WhatsApp `phone_number_id`, or `null` if no
   * agency is registered for it (the caller must skip processing — an
   * unattributable message must never be answered or persisted).
   */
  async resolveIdByPhoneNumberId(
    phoneNumberId: string,
  ): Promise<string | null> {
    const cached = this.readCache(this.cache, phoneNumberId);
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
      // Expected for an agency that hasn't connected its number yet: the
      // admin panel shows them a "WhatsApp no conectado" banner until they do.
      this.logger.error(
        `[AgencyService] No agency registered for phone_number_id: ${phoneNumberId}`,
      );
      return null;
    }

    this.writeCache(this.cache, phoneNumberId, data.id);
    return data.id;
  }

  /**
   * Returns the agency's contact email — the advisor address notified on
   * escalation — or `null` if the agency has none or cannot be found. Cached
   * in-process like the phone-number resolution, since it rarely changes.
   */
  async getContactEmail(agencyId: string): Promise<string | null> {
    const cached = this.readCache(this.emailCache, agencyId);
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

    this.writeCache(this.emailCache, agencyId, data.email);
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
   *
   * The new agency has no `whatsapp_phone_number_id` — Meta's id isn't
   * something an agency has at signup. It is connected later from the
   * settings screen (updateForAgency); until then no inbound message resolves
   * to this tenant.
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

  /**
   * Settings screen: updates the caller's own agency. `agencyId` always comes
   * from SupabaseAuthGuard, never from the request body.
   *
   * Only the keys actually present in the dto are written, so submitting one
   * section of the form never blanks the other. An explicit `null` clears the
   * column — that is how an agency disconnects its WhatsApp number.
   */
  async updateForAgency(
    agencyId: string,
    dto: UpdateAgencyDto,
  ): Promise<Agency> {
    const patch = this.toAgencyUpdate(dto);

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('No hay cambios para guardar.');
    }

    const { data, error } = await this.supabase.client
      .from('agencies')
      .update(patch)
      .eq('id', agencyId)
      .select()
      .single();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        if (error.message.includes('agencies_whatsapp_phone_number_id_key')) {
          throw new ConflictException(
            'Ese número de WhatsApp ya está vinculado a otra inmobiliaria.',
          );
        }
        if (error.message.includes('agencies_email_key')) {
          throw new ConflictException('Ese email ya está en uso.');
        }
      }

      this.logger.error(
        `[AgencyService] Failed to update agency | agencyId: ${agencyId} | error: ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to update agency');
    }

    this.invalidateCaches(agencyId, patch.whatsapp_phone_number_id);
    this.logger.log(
      `[AgencyService] Agency updated | agencyId: ${agencyId} | fields: ${Object.keys(
        patch,
      ).join(',')}`,
    );

    return data;
  }

  /**
   * Maps the camelCase dto to the snake_case row, keeping only the keys the
   * caller actually sent. `undefined` means "leave this column alone"; `null`
   * means "clear it" and is preserved.
   */
  private toAgencyUpdate(dto: UpdateAgencyDto): AgencyUpdate {
    const patch: AgencyUpdate = {};

    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.email !== undefined) patch.email = dto.email;
    if (dto.phone !== undefined) patch.phone = dto.phone;
    if (dto.whatsappPhoneNumberId !== undefined) {
      patch.whatsapp_phone_number_id = dto.whatsappPhoneNumberId;
    }

    return patch;
  }

  /**
   * Drops every cache entry an update could have invalidated:
   * - each phone-number entry pointing at this agency (matched by value, so a
   *   number the agency just released is evicted without re-reading the old
   *   row), and
   * - the number the agency just claimed, which may still be cached against
   *   its *previous* owner and would otherwise route that tenant's messages
   *   here.
   * - this agency's contact email, notified on escalation.
   *
   * Only this process is cleared; other instances rely on AGENCY_CACHE_TTL_MS.
   */
  private invalidateCaches(
    agencyId: string,
    claimedPhoneNumberId?: string | null,
  ): void {
    for (const [phoneNumberId, entry] of this.cache) {
      if (entry.value === agencyId) {
        this.cache.delete(phoneNumberId);
      }
    }

    if (claimedPhoneNumberId) {
      this.cache.delete(claimedPhoneNumberId);
    }

    this.emailCache.delete(agencyId);
  }

  /** Returns the cached value, or `null` if absent or past its TTL. */
  private readCache<T>(
    cache: Map<string, CacheEntry<T>>,
    key: string,
  ): T | null {
    const entry = cache.get(key);
    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      cache.delete(key);
      return null;
    }

    return entry.value;
  }

  private writeCache<T>(
    cache: Map<string, CacheEntry<T>>,
    key: string,
    value: T,
  ): void {
    cache.set(key, { value, expiresAt: Date.now() + AGENCY_CACHE_TTL_MS });
  }
}
