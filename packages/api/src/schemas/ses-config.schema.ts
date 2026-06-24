import { ColumnType, Selectable, Insertable, Updateable } from 'kysely';

export type SesAuthMethod = 'iam_credentials' | 'environment' | 'ses_smtp';

export interface SesConfigTable {
  id: string;
  project_id: string;
  auth_method: SesAuthMethod;
  region: string | null;
  // Encrypted with SES_ENCRYPTION_KEY — IAM auth only
  access_key_id_encrypted: string | null;
  secret_access_key_encrypted: string | null;
  // SES SMTP auth only
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user_encrypted: string | null;
  smtp_pass_encrypted: string | null;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

export type SesConfig = Selectable<SesConfigTable>;
export type NewSesConfig = Insertable<SesConfigTable>;
export type UpdateSesConfig = Updateable<SesConfigTable>;
