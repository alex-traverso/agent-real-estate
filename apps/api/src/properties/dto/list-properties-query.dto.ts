import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Constants } from 'types';
import {
  ADMIN_PROPERTY_SORT_COLUMNS,
  type AdminPropertySortColumn,
  type SortDirection,
} from '../types/admin-property-list.type';

const { operation_type, property_type } = Constants.public.Enums;

// Free-text search is matched with ILIKE against title and address; a longer
// term buys nothing and only widens the input handed to PostgREST.
const MAX_SEARCH_LENGTH = 120;
const MAX_ZONE_LENGTH = 80;

export class ListPropertiesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_SEARCH_LENGTH)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_ZONE_LENGTH)
  zone?: string;

  @IsOptional()
  @IsIn(operation_type)
  operation?: (typeof operation_type)[number];

  @IsOptional()
  @IsIn(property_type)
  type?: (typeof property_type)[number];

  // Query strings carry no types: 'true'/'false' arrive as strings, so they are
  // coerced before @IsBoolean sees them. Anything else is left untouched and
  // fails validation rather than being silently read as false.
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  available?: boolean;

  @IsOptional()
  @IsIn(ADMIN_PROPERTY_SORT_COLUMNS)
  sort?: AdminPropertySortColumn = 'created_at';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: SortDirection = 'desc';
}
