import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export enum SesAuthMethod {
  IAM_CREDENTIALS = 'iam_credentials',
  ENVIRONMENT = 'environment',
  SES_SMTP = 'ses_smtp',
}

export class CreateSesConfigDto {
  @IsString()
  @IsNotEmpty()
  project_id: string;

  @IsEnum(SesAuthMethod)
  auth_method: SesAuthMethod;

  @IsString()
  @IsOptional()
  region?: string;

  // Required when auth_method = iam_credentials
  @ValidateIf((o) => o.auth_method === SesAuthMethod.IAM_CREDENTIALS)
  @IsString()
  @IsNotEmpty()
  access_key_id?: string;

  @ValidateIf((o) => o.auth_method === SesAuthMethod.IAM_CREDENTIALS)
  @IsString()
  @IsNotEmpty()
  secret_access_key?: string;

  // Required when auth_method = ses_smtp
  @ValidateIf((o) => o.auth_method === SesAuthMethod.SES_SMTP)
  @IsString()
  @IsNotEmpty()
  smtp_host?: string;

  @ValidateIf((o) => o.auth_method === SesAuthMethod.SES_SMTP)
  @IsNumber()
  smtp_port?: number;

  @ValidateIf((o) => o.auth_method === SesAuthMethod.SES_SMTP)
  @IsString()
  @IsNotEmpty()
  smtp_user?: string;

  @ValidateIf((o) => o.auth_method === SesAuthMethod.SES_SMTP)
  @IsString()
  @IsNotEmpty()
  smtp_pass?: string;
}
