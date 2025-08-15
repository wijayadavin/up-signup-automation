import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('users')
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('first_name', 'varchar(255)', (col) => col.notNull())
    .addColumn('last_name', 'varchar(255)', (col) => col.notNull())
    .addColumn('email', 'varchar(255)', (col) => col.notNull().unique())
    .addColumn('password', 'varchar(255)', (col) => col.notNull())
    .addColumn('country_code', 'varchar(10)', (col) => col.notNull())
    .addColumn('last_attempt_at', 'timestamp')
    .addColumn('attempt_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('last_error_code', 'varchar(100)')
    .addColumn('last_error_message', 'text')
    .addColumn('success_at', 'timestamp')
    .addColumn('created_at', 'timestamp', (col) => 
      col.notNull().defaultTo(db.fn('now', []))
    )
    .addColumn('updated_at', 'timestamp', (col) => 
      col.notNull().defaultTo(db.fn('now', []))
    )
    .execute();

  // Create indexes for better performance
  await db.schema
    .createIndex('users_email_idx')
    .on('users')
    .column('email')
    .execute();

  await db.schema
    .createIndex('users_attempt_count_idx')
    .on('users')
    .column('attempt_count')
    .execute();

  await db.schema
    .createIndex('users_success_at_idx')
    .on('users')
    .column('success_at')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('users').execute();
}
