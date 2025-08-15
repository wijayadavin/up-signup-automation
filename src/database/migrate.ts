import { getDatabase } from './connection.js';
import { getLogger } from '../utils/logger.js';
import * as migration001 from './migrations/001_create_users_table.js';

const logger = getLogger(import.meta.url);

const migrations = [
  { name: '001_create_users_table', up: migration001.up, down: migration001.down }
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
