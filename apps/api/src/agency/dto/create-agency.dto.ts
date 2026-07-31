import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Onboarding input: creates the agency that owns the calling (agency-less)
 * user. camelCase, like every other input boundary in the app; the service
 * maps it to the snake_case `agencies` row via the create_agency_with_owner
 * RPC. Only `name` and `email` are required — mirrors the `agencies` schema,
 * where those two columns are NOT NULL and everything else isn't.
 */
export class CreateAgencyDto {
  @IsString()
  @MaxLength(200)
  name: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;
}
