import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('users')
    .addColumn('onboarding_completed_at', 'timestamp', (col) => col.defaultTo(null))
    .addColumn('last_session_state', 'text', (col) => col.defaultTo(null))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('users')
    .dropColumn('onboarding_completed_at')
    .dropColumn('last_session_state')
    .execute();
}
