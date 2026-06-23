import { IsEmail, IsNumber, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class ProjectInviteDto {
  @IsString()
  project_id: string;

  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  role_id: number;

  @IsEmail()
  email: string;
}
