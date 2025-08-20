import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('requests')
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('user_id', 'integer', (col) => col.notNull().references('users.id'))
    .addColumn('status', 'varchar(50)', (col) => col.notNull().defaultTo('RUNNING'))
    .addColumn('attempt_count', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('started_at', 'timestamp', (col) => col.notNull().defaultTo(db.fn('now', [])))
    .addColumn('completed_at', 'timestamp')
    .addColumn('error_code', 'varchar(100)')
    .addColumn('error_message', 'text')
    .addColumn('options', 'jsonb') // Store command options as JSON
    .execute();

  // Create indexes for better performance
  await db.schema
    .createIndex('requests_user_id_idx')
    .on('requests')
    .column('user_id')
    .execute();

  await db.schema
    .createIndex('requests_status_idx')
    .on('requests')
    .column('status')
    .execute();

  await db.schema
    .createIndex('requests_started_at_idx')
    .on('requests')
    .column('started_at')
    .execute();

  await db.schema
    .createIndex('requests_user_status_idx')
    .on('requests')
    .columns(['user_id', 'status'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('requests').execute();
}
