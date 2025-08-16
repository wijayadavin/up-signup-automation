import { getDatabase } from './connection.js';
import { getLogger } from '../utils/logger.js';
import * as migration001 from './migrations/001_create_users_table.js';
import * as migration002 from './migrations/002_add_captcha_flagged_at.js';
import * as migration003 from './migrations/003_add_location_columns.js';
import * as migration004 from './migrations/004_add_birth_date.js';

const logger = getLogger(import.meta.url);

const migrations = [
  { name: '001_create_users_table', up: migration001.up, down: migration001.down },
  { name: '002_add_captcha_flagged_at', up: migration002.up, down: migration002.down },
  { name: '003_add_location_columns', up: migration003.up, down: migration003.down },
  { name: '004_add_birth_date', up: migration004.up, down: migration004.down }
];

export async function runMigrations(): Promise<void> {
  const db = getDatabase();
  
  try {
    // Create migrations table if it doesn't exist
    await db.schema
      .createTable('migrations')
      .ifNotExists()
      .addColumn('id', 'serial', (col) => col.primaryKey())
      .addColumn('name', 'varchar(255)', (col) => col.notNull().unique())
      .addColumn('executed_at', 'timestamp', (col) => 
        col.notNull().defaultTo(db.fn('now', []))
      )
      .execute();

    // Get executed migrations
    const executedMigrations = await db
      .selectFrom('migrations')
      .select('name')
      .execute();

    const executedNames = new Set(executedMigrations.map(m => m.name));

    // Run pending migrations
    for (const migration of migrations) {
      if (!executedNames.has(migration.name)) {
        logger.info(`Running migration: ${migration.name}`);
        await migration.up(db as any);
        
        await db
          .insertInto('migrations')
          .values({ 
            name: migration.name,
            executed_at: new Date()
          })
          .execute();
        
        logger.info(`Migration completed: ${migration.name}`);
      }
    }

    logger.info('All migrations completed successfully');
  } catch (error) {
    logger.error(error, 'Migration failed');
    throw error;
  }
}
