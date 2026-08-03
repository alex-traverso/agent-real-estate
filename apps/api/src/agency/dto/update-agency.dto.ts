import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { WHATSAPP_PHONE_NUMBER_ID_PATTERN } from '../agency.constants';

/**
 * Admin panel input for editing the caller's own agency (PATCH /agencies/me).
 * Every field is optional: an absent key leaves the column untouched, so the
 * settings form can submit either section without clobbering the other.
 *
 * `phone` and `whatsappPhoneNumberId` also accept an explicit `null` to clear
 * the column — `@IsOptional()` skips validation for both `null` and
 * `undefined`, and the service distinguishes the two (`undefined` = don't
 * touch, `null` = clear).
 *
 * Messages are in Spanish, unlike the other DTOs in this app: they are
 * rendered verbatim in the admin panel's settings form (see `parseErrorMessage`
 * in apps/admin/lib/api/client.ts), same as the Spanish ConflictExceptions
 * AgencyService already throws.
 */
export class UpdateAgencyDto {
  @IsOptional()
  @IsString({ message: 'El nombre debe ser un texto.' })
  @MaxLength(200, { message: 'El nombre no puede superar los 200 caracteres.' })
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Ingresá un email válido.' })
  email?: string;

  @IsOptional()
  @IsString({ message: 'El teléfono debe ser un texto.' })
  @MaxLength(50, { message: 'El teléfono no puede superar los 50 caracteres.' })
  phone?: string | null;

  @IsOptional()
  @Matches(WHATSAPP_PHONE_NUMBER_ID_PATTERN, {
    message:
      'El Phone Number ID de WhatsApp debe tener sólo números (entre 5 y 20 dígitos).',
  })
  whatsappPhoneNumberId?: string | null;
}
