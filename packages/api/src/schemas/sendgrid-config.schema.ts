import { ColumnType, Selectable, Insertable, Updateable } from 'kysely';

export interface SendgridConfigTable {
  id: string;
  project_id: string;
  api_key_encrypted: string;
  from_email: string | null;
  from_name: string | null;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

export type SendgridConfig = Selectable<SendgridConfigTable>;
export type NewSendgridConfig = Insertable<SendgridConfigTable>;
export type UpdateSendgridConfig = Updateable<SendgridConfigTable>;
