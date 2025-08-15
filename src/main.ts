import { command, flag, option, run } from 'cmd-ts';
import { string, number, boolean } from 'cmd-ts';
import { z } from 'zod';
import dotenv from 'dotenv';
import { getLogger } from './utils/logger.js';
import { runMigrations } from './database/migrate.js';
import { closeDatabase } from './database/connection.js';
import { BrowserManager } from './browser/browserManager.js';
import { UserService } from './services/userService.js';
import { UpworkService } from './services/upworkService.js';

// Load environment variables
dotenv.config();

const logger = getLogger(import.meta.url);

// Command to visit login page
const visitLoginPageCmd = command({
  name: 'visit-login',
  description: 'Visit the Upwork login page',
  args: {
    headless: flag({
      type: boolean,
      long: 'headless',
      short: 'h',
      description: 'Run browser in headless mode',
      defaultValue: () => false,
    }),
  },
  handler: async (args) => {
    try {
      logger.info('Starting Upwork login page visit...');
      
      // Run migrations
      await runMigrations();
      
      // Initialize services
      const browserManager = new BrowserManager({ headless: args.headless });
      const userService = new UserService();
      const upworkService = new UpworkService(browserManager, userService);
      
      // Visit login page
      const success = await upworkService.visitLoginPage();
      
      if (success) {
        logger.info('Successfully visited Upwork login page');
      } else {
        logger.error('Failed to visit Upwork login page');
        process.exit(1);
      }
      
      // Cleanup
      await upworkService.close();
      await closeDatabase();
      
    } catch (error) {
      logger.error(error, 'Failed to visit login page');
      process.exit(1);
    }
  },
});

// Command to add a user
const addUserCmd = command({
  name: 'add-user',
  description: 'Add a new user to the database',
  args: {
    firstName: option({
      type: string,
      long: 'first-name',
      short: 'f',
      description: 'First name',
    }),
    lastName: option({
      type: string,
      long: 'last-name',
      short: 'l',
      description: 'Last name',
    }),
    email: option({
      type: string,
      long: 'email',
      short: 'e',
      description: 'Email address',
    }),
    password: option({
      type: string,
      long: 'password',
      short: 'p',
      description: 'Password',
    }),
    countryCode: option({
      type: string,
      long: 'country-code',
      short: 'c',
      description: 'Country code (e.g., US, CA)',
      defaultValue: () => 'US',
    }),
  },
  handler: async (args) => {
    try {
      // Validate required fields
      if (!args.firstName || !args.lastName || !args.email || !args.password) {
        logger.error('All fields (first-name, last-name, email, password) are required');
        process.exit(1);
      }
      
      // Run migrations
      await runMigrations();
      
      // Initialize services
      const userService = new UserService();
      
      // Create user
      const user = await userService.createUser({
        first_name: args.firstName,
        last_name: args.lastName,
        email: args.email,
        password: args.password,
        country_code: args.countryCode,
      });
      
      logger.info({ userId: user.id, email: user.email }, 'User created successfully');
      
      // Cleanup
      await closeDatabase();
      
    } catch (error) {
      logger.error(error, 'Failed to create user');
      process.exit(1);
    }
  },
});

// Command to process pending users
const processUsersCmd = command({
  name: 'process-users',
  description: 'Process pending users for sign-up automation',
  args: {
    limit: option({
      type: number,
      long: 'limit',
      short: 'l',
      description: 'Maximum number of users to process',
      defaultValue: () => 5,
    }),
    headless: flag({
      type: boolean,
      long: 'headless',
      short: 'h',
      description: 'Run browser in headless mode',
      defaultValue: () => false,
    }),
  },
  handler: async (args) => {
    try {
      logger.info('Starting user processing...');
      
      // Run migrations
      await runMigrations();
      
      // Initialize services
      const browserManager = new BrowserManager({ headless: args.headless });
      const userService = new UserService();
      const upworkService = new UpworkService(browserManager, userService);
      
      // Process users
      await upworkService.processPendingUsers(args.limit);
      
      // Get stats
      const stats = await upworkService.getStats();
      logger.info(stats, 'Processing completed');
      
      // Cleanup
      await upworkService.close();
      await closeDatabase();
      
    } catch (error) {
      logger.error(error, 'Failed to process users');
      process.exit(1);
    }
  },
});

// Command to show stats
const statsCmd = command({
  name: 'stats',
  description: 'Show application statistics',
  args: {},
  handler: async () => {
    try {
      // Run migrations
      await runMigrations();
      
      // Initialize services
      const userService = new UserService();
      
      // Get stats
      const stats = await userService.getStats();
      
      logger.info('Application Statistics:');
      logger.info(`Total Users: ${stats.total}`);
      logger.info(`Successful: ${stats.successful}`);
      logger.info(`Pending: ${stats.pending}`);
      logger.info(`Failed: ${stats.failed}`);
      
      // Cleanup
      await closeDatabase();
      
    } catch (error) {
      logger.error(error, 'Failed to get stats');
      process.exit(1);
    }
  },
});

// Main command with subcommands
const mainCmd = command({
  name: 'up-crawler',
  description: 'Upwork sign-up automation tool',
  version: '1.0.0',
  args: {},
  handler: async () => {
    logger.info('Upwork Crawler - Sign-up Automation Tool');
    logger.info('Available commands:');
    logger.info('  visit-login     - Visit the Upwork login page');
    logger.info('  add-user        - Add a new user to the database');
    logger.info('  process-users   - Process pending users for automation');
    logger.info('  stats           - Show application statistics');
    logger.info('Use --help with any command for more information');
  },
});

// Create a simple command runner
const commandName = process.argv[2];
const commandArgs = process.argv.slice(3);

switch (commandName) {
  case 'visit-login':
    await run(visitLoginPageCmd, commandArgs);
    break;
  case 'add-user':
    await run(addUserCmd, commandArgs);
    break;
  case 'process-users':
    await run(processUsersCmd, commandArgs);
    break;
  case 'stats':
    await run(statsCmd, commandArgs);
    break;
  default:
    await run(mainCmd, process.argv.slice(2));
}
