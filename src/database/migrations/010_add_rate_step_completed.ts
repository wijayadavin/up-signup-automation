import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  try {
    await db.schema
      .alterTable('users')
      .addColumn('rate_step_completed_at', 'timestamp')
      .execute();
  } catch (error: any) {
    // If column already exists, ignore the error
    if (error.message && error.message.includes('already exists')) {
      console.log('Column rate_step_completed_at already exists, skipping...');
    } else {
      throw error;
    }
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('users')
    .dropColumn('rate_step_completed_at')
    .execute();
}
