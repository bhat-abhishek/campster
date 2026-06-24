import {
  IsBoolean,
  IsString,
  MinLength,
  ValidateIf,
  IsIn,
  IsDateString,
} from 'class-validator';

export class CreateCampaignDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(2)
  subject: string;

  @IsString()
  mail_from: string;

  @IsString()
  @MinLength(10)
  template_id: string;

  @IsString()
  @MinLength(10)
  contact_list_id: string;

  @IsString()
  @MinLength(10)
  project_id: string;

  @IsBoolean()
  send_later: boolean;

  // Make scheduled_date required if send_later is true
  @ValidateIf((o) => o.send_later === true)
  @IsDateString()
  scheduled_at?: Date;

  @IsIn(['draft', 'scheduled'])
  status: 'draft' | 'scheduled';
}
