import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';
import { Constants } from 'types';

const { property_type, operation_type, currency_type } = Constants.public.Enums;

/**
 * Admin panel input for creating a property. camelCase, like every other
 * input boundary in the app (SaveLeadInput, PropertyFilters); the service
 * maps it to the snake_case `properties` row. Enum values are validated
 * against the generated `Constants` (single source of truth from the DB
 * schema), never hardcoded.
 */
export class CreatePropertyDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  zone: string;

  @IsIn(property_type)
  type: (typeof property_type)[number];

  @IsIn(operation_type)
  operation: (typeof operation_type)[number];

  @IsNumber()
  @IsPositive()
  price: number;

  @IsOptional()
  @IsIn(currency_type)
  currency?: (typeof currency_type)[number];

  @IsOptional()
  @IsInt()
  @Min(0)
  rooms?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  bedrooms?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  bathrooms?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  coveredArea?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalArea?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hoaFees?: number;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsBoolean()
  parking?: boolean;
}
