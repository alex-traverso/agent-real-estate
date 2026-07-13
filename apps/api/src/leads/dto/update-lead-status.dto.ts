import { IsIn } from 'class-validator';
import { Constants } from 'types';

const { lead_status } = Constants.public.Enums;

export class UpdateLeadStatusDto {
  @IsIn(lead_status)
  status: (typeof lead_status)[number];
}
