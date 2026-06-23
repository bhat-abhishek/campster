import {
  IsBoolean,
  IsString,
  MinLength,
  ValidateIf,
  IsIn,
} from 'class-validator';

export class UpdateCampaignDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(2)
  subject: string;

  @IsString()
  mail_from: string;

  @IsString({ message: 'Project should be string' })
  project_id: string;

  @IsString()
  campaign_id: string;

  @IsString()
  @MinLength(10)
  template_id: string;

  @IsString()
  @MinLength(10)
  contact_list_id: string;

  @IsBoolean()
  send_later: boolean;

  // Make scheduled_date required if send_later is true
  @ValidateIf((o) => o.send_later === true)
  @IsDate()
  scheduled_at?: Date;

  @IsIn(['draft', 'scheduled'])
  status: 'draft' | 'scheduled';
}
