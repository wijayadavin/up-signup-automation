import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('users')
    .addColumn('location_street_address', 'varchar(500)')
    .addColumn('location_city', 'varchar(255)')
    .addColumn('location_state', 'varchar(255)')
    .addColumn('location_post_code', 'varchar(20)')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('users')
    .dropColumn('location_street_address')
    .dropColumn('location_city')
    .dropColumn('location_state')
    .dropColumn('location_post_code')
    .execute();
}
