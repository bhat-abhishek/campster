import { Kysely, sql } from 'kysely';

export const up = async (db: Kysely<any>): Promise<void> => {
  await db.schema
    .createTable('sendgrid_configs')
    .addColumn('id', 'varchar', (col) => col.primaryKey())
    .addColumn('project_id', 'varchar', (col) => col.notNull().unique())
    .addColumn('api_key_encrypted', 'varchar', (col) => col.notNull())
    .addColumn('from_email', 'varchar')
    .addColumn('from_name', 'varchar')
    .addColumn('updated_at', 'timestamp', (col) =>
      col.defaultTo(sql`now()`).notNull(),
    )
    .addColumn('created_at', 'timestamp', (col) =>
      col.defaultTo(sql`now()`).notNull(),
    )
    .execute();
};

export const down = async (db: Kysely<any>) => {
  await db.schema.dropTable('sendgrid_configs').execute();
};
