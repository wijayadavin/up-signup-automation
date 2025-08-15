import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { Database } from '../types/database.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger(import.meta.url);

let db: Kysely<Database> | null = null;

export function getDatabase(): Kysely<Database> {
  if (!db) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    const pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    db = new Kysely<Database>({
      dialect: new PostgresDialect({
        pool,
      }),
      log: (event) => {
        if (event.level === 'error') {
          logger.error(event, 'Database error');
        }
      },
    });

    logger.info('Database connection established');
  }

  return db;
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.destroy();
    db = null;
    logger.info('Database connection closed');
  }
}
