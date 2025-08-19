import { getDatabase } from '../connection.js';

export async function up() {
  const db = getDatabase();
  
  await db.schema
    .alterTable('users')
    .addColumn('otp_provider', 'varchar(50)')
    .execute();
}

export async function down() {
  const db = getDatabase();
  
  await db.schema
    .alterTable('users')
    .dropColumn('otp_provider')
    .execute();
}
