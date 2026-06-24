import { Kysely, sql } from 'kysely';

export const up = async (db: Kysely<any>): Promise<void> => {
  await db.schema
    .createTable('ses_configs')
    .addColumn('id', 'varchar', (col) => col.primaryKey())
    .addColumn('project_id', 'varchar', (col) => col.notNull().unique())
    .addColumn('auth_method', 'varchar', (col) => col.notNull())
    .addColumn('region', 'varchar')
    .addColumn('access_key_id_encrypted', 'varchar')
    .addColumn('secret_access_key_encrypted', 'varchar')
    .addColumn('smtp_host', 'varchar')
    .addColumn('smtp_port', 'integer')
    .addColumn('smtp_user_encrypted', 'varchar')
    .addColumn('smtp_pass_encrypted', 'varchar')
    .addColumn('updated_at', 'timestamp', (col) =>
      col.defaultTo(sql`now()`).notNull(),
    )
    .addColumn('created_at', 'timestamp', (col) =>
      col.defaultTo(sql`now()`).notNull(),
    )
    .execute();
};

export const down = async (db: Kysely<any>) => {
  await db.schema.dropTable('ses_configs').execute();
};
