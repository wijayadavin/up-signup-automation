import { Kysely } from 'kysely';
import { getLogger } from '../../utils/logger.js';

const logger = getLogger(import.meta.url);

export async function up(db: Kysely<any>): Promise<void> {
  // First, assign unique proxy ports to any users that don't have one
  const usersWithoutPort = await db
    .selectFrom('users')
    .select(['id', 'last_proxy_port'])
    .where('last_proxy_port', 'is', null)
    .execute();

  logger.info(`Found ${usersWithoutPort.length} users without proxy ports, assigning unique ports...`);

  // Also find users with duplicate proxy ports
  const duplicatePortsQuery = await db
    .selectFrom('users')
    .select(['last_proxy_port'])
    .where('last_proxy_port', 'is not', null)
    .groupBy('last_proxy_port')
    .having((eb) => eb.fn.count('id'), '>', 1)
    .execute();

  const duplicatePorts = duplicatePortsQuery.map(row => row.last_proxy_port);
  logger.info(`Found ${duplicatePorts.length} duplicate proxy ports: [${duplicatePorts.join(', ')}]`);

  // Get all users with duplicate ports (keeping first occurrence)
  const usersWithDuplicatePorts = [];
  for (const port of duplicatePorts) {
    const usersWithThisPort = await db
      .selectFrom('users')
      .select(['id', 'last_proxy_port'])
      .where('last_proxy_port', '=', port)
      .orderBy('id', 'asc')
      .execute();
    
    // Keep the first user with this port, mark others for reassignment
    usersWithDuplicatePorts.push(...usersWithThisPort.slice(1));
    logger.info(`Port ${port}: keeping user ${usersWithThisPort[0].id}, reassigning ${usersWithThisPort.length - 1} duplicate(s)`);
  }

  // Combine users without ports and users with duplicate ports
  const usersToReassign = [...usersWithoutPort, ...usersWithDuplicatePorts];
  logger.info(`Total users needing port assignment: ${usersToReassign.length}`);

  // Find next available port starting from 10001
  let nextPort = 10001;
  for (const user of usersToReassign) {
    // Find the next available port
    while (true) {
      const existingUser = await db
        .selectFrom('users')
        .select('id')
        .where('last_proxy_port', '=', nextPort)
        .executeTakeFirst();

      if (!existingUser) {
        break; // Port is available
      }
      nextPort++;
    }

    // Assign the port to this user
    await db
      .updateTable('users')
      .set({ last_proxy_port: nextPort })
      .where('id', '=', user.id)
      .execute();

    logger.info(`Assigned port ${nextPort} to user ${user.id}`);
    nextPort++;
  }

  // Now make the column non-nullable
  await db.schema
    .alterTable('users')
    .alterColumn('last_proxy_port', (col) => col.setNotNull())
    .execute();

  // Add unique constraint
  await db.schema
    .createIndex('users_last_proxy_port_unique_idx')
    .on('users')
    .column('last_proxy_port')
    .unique()
    .execute();

  // Add country_code column to requests table
  await db.schema
    .alterTable('requests')
    .addColumn('country_code', 'varchar(10)')
    .execute();

  // Add index for country_code
  await db.schema
    .createIndex('requests_country_code_idx')
    .on('requests')
    .column('country_code')
    .execute();

  logger.info('Successfully made last_proxy_port non-nullable and unique, and added country_code to requests table');
}

export async function down(db: Kysely<any>): Promise<void> {
  // Remove unique constraint
  await db.schema
    .dropIndex('users_last_proxy_port_unique_idx')
    .on('users')
    .execute();

  // Make column nullable again
  await db.schema
    .alterTable('users')
    .alterColumn('last_proxy_port', (col) => col.dropNotNull())
    .execute();

  logger.info('Reverted last_proxy_port changes');
}
