import dotenv from 'dotenv';
import { getLogger } from './utils/logger.js';
import { runMigrations } from './database/migrate.js';
import { closeDatabase } from './database/connection.js';

// Load environment variables
dotenv.config();

const logger = getLogger(import.meta.url);

async function main() {
  try {
    logger.info('Running database migrations...');
    await runMigrations();
    logger.info('Migrations completed successfully');
  } catch (error) {
    logger.error(error, 'Migration failed');
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

main();
