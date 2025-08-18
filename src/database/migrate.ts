import { getDatabase } from './connection.js';
import { getLogger } from '../utils/logger.js';
import * as migration001 from './migrations/001_create_users_table.js';
import * as migration002 from './migrations/002_add_captcha_flagged_at.js';
import * as migration003 from './migrations/003_add_location_columns.js';
import * as migration004 from './migrations/004_add_birth_date.js';
import * as migration005 from './migrations/005_add_phone.js';
import * as migration006 from './migrations/006_add_onboarding_and_session.js';
import * as migration007 from './migrations/007_add_up_created_at.js';
import * as migration008 from './migrations/008_add_manual_otp.js';
import * as migration009 from './migrations/009_add_rate_step_completed.js';

const logger = getLogger(import.meta.url);

const migrations = [
  { name: '001_create_users_table', up: migration001.up, down: migration001.down },
  { name: '002_add_captcha_flagged_at', up: migration002.up, down: migration002.down },
  { name: '003_add_location_columns', up: migration003.up, down: migration003.down },
  { name: '004_add_birth_date', up: migration004.up, down: migration004.down },
  { name: '005_add_phone', up: migration005.up, down: migration005.down },
  { name: '006_add_onboarding_and_session', up: migration006.up, down: migration006.down },
  { name: '007_add_up_created_at', up: migration007.up, down: migration007.down },
  { name: '008_add_manual_otp', up: migration008.up, down: migration008.down },
  { name: '009_add_rate_step_completed', up: migration009.up, down: migration009.down }
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
