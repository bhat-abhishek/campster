import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateSendgridConfigDto {
  @IsString()
  @IsNotEmpty()
  project_id: string;

  @IsString()
  @IsNotEmpty()
  api_key: string;

  @IsString()
  @IsOptional()
  from_email?: string;

  @IsString()
  @IsOptional()
  from_name?: string;
}
