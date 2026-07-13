import { PartialType } from '@nestjs/mapped-types';
import { CreatePropertyDto } from './create-property.dto';

/** Every field optional: the admin patches only what changed. */
export class UpdatePropertyDto extends PartialType(CreatePropertyDto) {}
