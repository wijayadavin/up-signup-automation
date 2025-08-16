import { command, flag, option, run } from 'cmd-ts';
import { string, number, boolean } from 'cmd-ts';
import { z } from 'zod';
import dotenv from 'dotenv';
import { getLogger } from './utils/logger.js';
import { importUsersFromCsv } from './commands/importCsv.js';
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
    keepOpen: flag({
      type: boolean,
      long: 'keep-open',
      short: 'k',
      description: 'Keep browser open indefinitely (only close on error)',
      defaultValue: () => false,
    }),
  },
  handler: async (args) => {
    let upworkService: UpworkService | null = null;
    
    try {
      logger.info('Starting Upwork login page visit...');
      
      // Run migrations
      await runMigrations();
      
      // Initialize services
      const browserManager = new BrowserManager({ headless: args.headless });
      const userService = new UserService();
      upworkService = new UpworkService(browserManager, userService);
      
      // Visit login page
      logger.info(`Keep open mode: ${args.keepOpen}`);
      const success = await upworkService.visitLoginPage(args.keepOpen);
      
      if (success) {
        logger.info('Successfully visited Upwork login page');
        
        if (args.keepOpen) {
          logger.info('Keeping browser open in keep-open mode. Press Ctrl+C to exit.');
          
          // Keep the process alive
          process.on('SIGINT', async () => {
            logger.info('Received SIGINT, closing browser...');
            if (upworkService) {
              await upworkService.close();
            }
            await closeDatabase();
            process.exit(0);
          });
          
          // Keep the process running
          await new Promise(() => {
            // This promise never resolves, keeping the process alive
          });
        } else {
          // Cleanup
          if (upworkService) {
            await upworkService.close();
          }
          await closeDatabase();
        }
      } else {
        logger.error('Failed to visit Upwork login page');
        
        if (args.keepOpen) {
          logger.info('Keeping browser open in keep-open mode despite error. Press Ctrl+C to exit.');
          
          // Keep the process alive even on error
          process.on('SIGINT', async () => {
            logger.info('Received SIGINT, closing browser...');
            if (upworkService) {
              await upworkService.close();
            }
            await closeDatabase();
            process.exit(0);
          });
          
          // Keep the process running
          await new Promise(() => {
            // This promise never resolves, keeping the process alive
          });
        } else {
          // Cleanup only if not in idle mode
          if (upworkService) {
            await upworkService.close();
          }
          await closeDatabase();
          process.exit(1);
        }
      }
      
    } catch (error) {
      logger.error(error, 'Failed to visit login page');
      
      if (args.keepOpen) {
        logger.info('Keeping browser open in keep-open mode despite error. Press Ctrl+C to exit.');
        
        // Keep the process alive even on error
        process.on('SIGINT', async () => {
          logger.info('Received SIGINT, closing browser...');
          if (upworkService) {
            await upworkService.close();
          }
          await closeDatabase();
          process.exit(0);
        });
        
        // Keep the process running
        await new Promise(() => {
          // This promise never resolves, keeping the process alive
        });
      } else {
        process.exit(1);
      }
    }
  },
});

// Command to import users from CSV
const importCsvCmd = command({
  name: 'import-csv',
  description: 'Import users from a CSV file',
  args: {
    file: option({ type: string, long: 'file', short: 'f', description: 'Path to CSV file' }),
    force: flag({ long: 'force', short: 'F', description: 'Force update existing users' }),
  },
  handler: async (args) => {
    try {
      await runMigrations();
      const result = await importUsersFromCsv({ file: args.file, force: args.force });
      logger.info(result, 'CSV import completed');
      await closeDatabase();
    } catch (error) {
      logger.error(error, 'Failed to import from CSV');
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

// Command to test proxy configuration
const testProxyCmd = command({
  name: 'test-proxy',
  description: 'Test proxy configuration',
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
      logger.info('Testing proxy configuration...');
      
      // Initialize browser manager
      const browserManager = new BrowserManager({ headless: args.headless });
      
      // Log proxy configuration
      if (browserManager.isProxyEnabled()) {
        const proxyInfo = browserManager.getProxyInfo();
        const proxyHost = proxyInfo?.country 
          ? `${proxyInfo.country}.decodo.com`
          : proxyInfo?.host;
        
        // Construct the full username for display
        let displayUsername = proxyInfo?.username;
        const hasCountryInUsername = proxyInfo?.username?.includes('-country-');
        const hasZipInUsername = proxyInfo?.username?.includes('-zip-');
        
        if (!hasCountryInUsername && proxyInfo?.country && proxyInfo?.zipCode) {
          displayUsername = `${proxyInfo.username}-country-${proxyInfo.country}-zip-${proxyInfo.zipCode}`;
        } else if (!hasCountryInUsername && proxyInfo?.country) {
          displayUsername = `${proxyInfo.username}-country-${proxyInfo.country}`;
        }
        
        logger.info({ 
          proxyHost,
          proxyPort: proxyInfo?.port,
          proxyCountry: proxyInfo?.country,
          proxyZipCode: proxyInfo?.zipCode,
          proxyRotateMinutes: proxyInfo?.rotateMinutes,
          proxyUsername: displayUsername
        }, 'Decodo proxy configuration detected');
        
        // Test proxy by visiting a simple page
        const page = await browserManager.newPage();
        logger.info('Testing proxy connection...');
        
        await page.goto('https://httpbin.org/ip', {
          waitUntil: 'networkidle2',
          timeout: 30000,
        });
        
        // Extract IP information from the page
        const ipInfo = await page.evaluate(() => {
          const pre = document.querySelector('pre');
          if (pre) {
            try {
              return JSON.parse(pre.textContent || '{}');
            } catch (e) {
              return { error: 'Failed to parse IP info' };
            }
          }
          return { error: 'IP info not found' };
        });
        
        logger.info('Successfully connected through proxy');
        logger.info('IP Information:', ipInfo);
        
        await page.close();
      } else {
        logger.info('No proxy configuration found');
      }
      
      // Cleanup
      await browserManager.close();
      
    } catch (error) {
      logger.error(error, 'Failed to test proxy configuration');
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
    logger.info('  test-proxy      - Test proxy configuration');
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
  case 'test-proxy':
    await run(testProxyCmd, commandArgs);
    break;
  case 'import-csv':
    await run(importCsvCmd, commandArgs);
    break;
  default:
    await run(mainCmd, process.argv.slice(2));
}
