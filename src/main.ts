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
import { ResumeGenerator } from './utils/resumeGenerator.js';
import { SessionService } from './services/sessionService.js';
// import { TextVerifiedService } from './services/textVerifiedService.js';
import fs from 'fs';
import { runTurnstileSolver } from './turnstile.js';

// Load environment variables
dotenv.config();

const logger = getLogger(import.meta.url);

// Command to visit login page
const visitLoginPageCmd = command({
  name: 'visit-login',
  description: 'Visit the Upwork login page',
  args: {
    userId: option({
      type: string,
      long: 'user-id',
      short: 'u',
      description: 'User ID to use for the session (optional)',
      defaultValue: () => '',
    }),
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
    debug: flag({
      type: boolean,
      long: 'debug',
      short: 'd',
      description: 'Debug mode: check login status only (no automation)',
      defaultValue: () => false,
    }),
    noProxy: flag({
      type: boolean,
      long: 'no-proxy',
      short: 'n',
      description: 'Disable proxy testing and use direct connection',
      defaultValue: () => false,
    }),
    noStealth: flag({
      type: boolean,
      long: 'no-stealth',
      short: 's',
      description: 'Disable stealth mode for debugging (use normal browser behavior)',
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
      const browserManager = new BrowserManager({ 
        headless: args.headless,
        skipProxyTest: args.noProxy,
        disableTrackingProtection: args.noStealth // Enable normal browser behavior when no-stealth is used
      });
      const userService = new UserService();
      upworkService = new UpworkService(browserManager, userService);
      
      // Parse user ID if provided
      const userId = args.userId ? parseInt(args.userId, 10) : undefined;
      
      // Visit login page
      logger.info(`User ID: ${userId || 'none'}, Keep open mode: ${args.keepOpen}, Debug mode: ${args.debug}`);
      
      if (args.noStealth) {
        logger.info('No-stealth mode enabled: using normal browser behavior for debugging');
      }
      
      let success: boolean;
      if (args.debug) {
        success = await upworkService.checkLoginStatus(args.keepOpen, userId);
      } else {
        success = await upworkService.visitLoginPage(args.keepOpen, userId);
      }
      
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

// Command to test resume generation
const testResumeCmd = command({
  name: 'test-resume',
  description: 'Test PDF resume generation for a specific user',
  args: {
    userId: option({
      type: number,
      long: 'user-id',
      short: 'u',
      description: 'User ID to generate resume for (optional)',
    }),
    email: option({
      type: string,
      long: 'email',
      short: 'e',
      description: 'User email to generate resume for (alternative to user-id, optional)',
    }),
    output: option({
      type: string,
      long: 'output',
      short: 'o',
      description: 'Output directory for generated resume files',
      defaultValue: () => './test-output',
    }),
    plainText: flag({
      type: boolean,
      long: 'plain-text',
      short: 'p',
      description: 'Also generate plain text version',
      defaultValue: () => false,
    }),
  },
  handler: async (args) => {
    try {
      logger.info('Starting resume generation test...');
      
      // Run migrations
      await runMigrations();
      
      // Initialize user service
      const userService = new UserService();
      
      // Get user by ID or email
      let user;
      if (args.userId) {
        user = await userService.getUserById(args.userId);
        if (!user) {
          logger.error(`User with ID ${args.userId} not found`);
          process.exit(1);
        }
      } else if (args.email) {
        user = await userService.getUserByEmail(args.email);
        if (!user) {
          logger.error(`User with email ${args.email} not found`);
          process.exit(1);
        }
      } else {
        // Get first available user
        const users = await userService.getPendingUsers(1);
        if (users.length === 0) {
          logger.error('No users found in database. Use add-user command first.');
          process.exit(1);
        }
        user = users[0];
        logger.info(`Using first available user: ${user.email} (ID: ${user.id})`);
      }
      
      logger.info({ userId: user.id, email: user.email }, 'Generating resume for user');
      
      // Create output directory
      if (!fs.existsSync(args.output)) {
        fs.mkdirSync(args.output, { recursive: true });
        logger.info(`Created output directory: ${args.output}`);
      }
      
      // Generate PDF resume
      logger.info('Generating PDF resume...');
      const pdfPath = await ResumeGenerator.generateResume(user);
      logger.info(`PDF resume generated: ${pdfPath}`);
      
      // Copy to output directory if different
      if (args.output !== './assets/resumes') {
        const outputPdfPath = `${args.output}/resume_${user.id}.pdf`;
        fs.copyFileSync(pdfPath, outputPdfPath);
        logger.info(`PDF copied to: ${outputPdfPath}`);
      }
      
      // Generate plain text version if requested
      if (args.plainText) {
        logger.info('Generating plain text resume...');
        const txtPath = await ResumeGenerator.generatePlainTextResume(user);
        logger.info(`Plain text resume generated: ${txtPath}`);
        
        // Copy to output directory if different
        if (args.output !== './assets/resumes') {
          const outputTxtPath = `${args.output}/resume_${user.id}.txt`;
          fs.copyFileSync(txtPath, outputTxtPath);
          logger.info(`Plain text copied to: ${outputTxtPath}`);
        }
      }
      
      // Validate PDF file
      const pdfStats = fs.statSync(pdfPath);
      logger.info({ 
        fileSize: `${(pdfStats.size / 1024).toFixed(2)} KB`,
        filePath: pdfPath 
      }, 'PDF file validation');
      
      if (pdfStats.size < 1000) {
        logger.warn('PDF file seems very small, might be corrupted');
      } else if (pdfStats.size > 500000) {
        logger.warn('PDF file is larger than 500KB, might not be ATS-friendly');
      } else {
        logger.info('PDF file size looks good for ATS parsing');
      }
      
      logger.info('Resume generation test completed successfully!');
      
      // Cleanup
      await closeDatabase();
      
    } catch (error) {
      logger.error(error, 'Failed to generate resume');
      process.exit(1);
    }
  },
});

// Command to process pending users
const processUsersCmd = command({
  name: 'process-users',
  description: 'Process pending users for sign-up automation',
  args: {
    userId: option({
      type: number,
      long: 'user-id',
      description: 'Process only a specific user by ID (overrides limit)',
      defaultValue: () => 0,
    }),
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
    upload: flag({
      type: boolean,
      long: 'upload',
      short: 'u',
      description: 'Test upload mode: only run until Step 4 (Resume Import)',
      defaultValue: () => false,
    }),
    noStealth: flag({
      type: boolean,
      long: 'no-stealth',
      short: 's',
      description: 'Disable stealth mode for debugging (use normal browser behavior)',
      defaultValue: () => false,
    }),
    restoreSession: flag({
      type: boolean,
      long: 'restore-session',
      short: 'r',
      description: 'Restore existing session instead of starting from login',
      defaultValue: () => false,
    }),
    skipOtp: flag({
      type: boolean,
      long: 'skip-otp',
      description: 'Skip location step (except profile picture) and redirect to submit page',
      defaultValue: () => false,
    }),
    skipLocation: flag({
      type: boolean,
      long: 'skip-location',
      description: 'Skip the location page and mark rate step as completed',
      defaultValue: () => false,
    }),
    step: option({
      type: string,
      long: 'step',
      description: 'Force start from a specific step (e.g., "employment")',
      defaultValue: () => '',
    }),
    retry: flag({
      type: boolean,
      long: 'retry',
      description: 'Retry users flagged with captcha after all other users are completed',
      defaultValue: () => false,
    }),
  },
  handler: async (args) => {
    try {
      logger.info('Starting user processing...');
      
      // Run migrations
      await runMigrations();
      
      // Initialize services
      const browserManager = new BrowserManager({ 
        headless: args.headless,
        disableTrackingProtection: args.noStealth // Enable normal browser behavior when no-stealth is used
      });
      const userService = new UserService();
      const upworkService = new UpworkService(browserManager, userService);
      
      // Process users
      if (args.userId > 0) {
        logger.info(`Single user mode enabled: will process only user ID ${args.userId}`);
      }

      if (args.step) {
        logger.info(`Force-step mode enabled: will start from "${args.step}" step`);
      }

      if (args.retry) {
        logger.info('Retry mode enabled: will retry captcha-flagged users after processing all other users');
      }

      if (args.upload) {
        logger.info('Upload mode enabled: will stop after Step 4 (Resume Import)');
        if (args.noStealth) {
          logger.info('No-stealth mode enabled: using normal browser behavior for debugging');
        }
        if (args.restoreSession) {
          logger.info('Restore-session mode enabled: will reuse existing sessions');
        }
        if (args.skipOtp) {
          logger.info('Skip-OTP mode enabled: will skip location step except profile picture and redirect to submit page');
        }
        await upworkService.processPendingUsers(args.userId > 0 ? 1 : args.limit, { 
          uploadOnly: true,
          restoreSession: args.restoreSession,
          skipOtp: args.skipOtp,
          step: args.step,
          retry: args.retry,
          userId: args.userId > 0 ? args.userId : undefined
        });
      } else {
        if (args.noStealth) {
          logger.info('No-stealth mode enabled: using normal browser behavior for debugging');
        }
        if (args.restoreSession) {
          logger.info('Restore-session mode enabled: will reuse existing sessions');
        }
        if (args.skipOtp) {
          logger.info('Skip-OTP mode enabled: will skip location step except profile picture and redirect to submit page');
        }
        if (args.skipLocation) {
          logger.info('Skip-Location mode enabled: will skip the location page and mark rate step as completed');
        }
        await upworkService.processPendingUsers(args.userId > 0 ? 1 : args.limit, {
          restoreSession: args.restoreSession,
          skipOtp: args.skipOtp,
          skipLocation: args.skipLocation,
          step: args.step,
          retry: args.retry,
          userId: args.userId > 0 ? args.userId : undefined
        });
      }
      
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
      const { RequestService } = await import('./services/requestService.js');
      const requestService = new RequestService();
      
      // Get stats
      const userStats = await userService.getStats();
      const requestStats = await requestService.getRequestStats();
      
      logger.info('=== Application Statistics ===');
      logger.info(`Total Users: ${userStats.total}`);
      logger.info(`Successful: ${userStats.successful}`);
      logger.info(`Pending: ${userStats.pending}`);
      logger.info(`Failed: ${userStats.failed}`);
      logger.info(`Retryable (attempts < 5): ${userStats.retryable}`);
      logger.info(`Exceeded Max Retries (>= 5): ${userStats.exceeded_max_retries}`);
      
      logger.info('\n=== Request Statistics ===');
      logger.info(`Total Requests: ${requestStats.total_requests}`);
      logger.info(`Running: ${requestStats.running_requests}`);
      logger.info(`Waiting for Retry: ${requestStats.waiting_for_retry_requests}`);
      logger.info(`Failed: ${requestStats.failed_requests}`);
      logger.info(`Successful: ${requestStats.successful_requests}`);
      logger.info(`Average Attempts: ${requestStats.average_attempts}`);
      
      // Cleanup
      await closeDatabase();
      
    } catch (error) {
      logger.error(error, 'Failed to get stats');
      process.exit(1);
    }
  },
});

// Command to show requests history
const requestsCmd = command({
  name: 'requests',
  description: 'Show requests history',
  args: {
    limit: option({
      type: number,
      long: 'limit',
      short: 'l',
      description: 'Number of recent requests to show',
      defaultValue: () => 10,
    }),
    status: option({
      type: string,
      long: 'status',
      short: 's',
      description: 'Filter by status (RUNNING, WAITING_FOR_RETRY, FAILED, SUCCESS)',
      defaultValue: () => '',
    }),
    userId: option({
      type: string,
      long: 'user-id',
      short: 'u',
      description: 'Filter by user ID',
      defaultValue: () => '',
    }),
  },
  handler: async (args) => {
    try {
      // Run migrations
      await runMigrations();
      
      // Initialize services
      const { RequestService } = await import('./services/requestService.js');
      const requestService = new RequestService();
      
      let requests;
      if (args.userId) {
        const userId = parseInt(args.userId, 10);
        if (isNaN(userId)) {
          logger.error('Invalid user ID');
          process.exit(1);
        }
        requests = await requestService.getRequestsForUser(userId, args.limit);
        logger.info(`=== Recent Requests for User ${userId} (last ${args.limit}) ===`);
      } else if (args.status) {
        requests = await requestService.getRequestsByStatus(args.status, args.limit);
        logger.info(`=== Recent Requests with Status ${args.status} (last ${args.limit}) ===`);
      } else {
        requests = await requestService.getRequests(args.limit);
        logger.info(`=== Recent Requests (last ${args.limit}) ===`);
      }
      
      if (requests.length === 0) {
        logger.info('No requests found');
      } else {
        for (const request of requests) {
          const duration = request.completed_at 
            ? Math.round((request.completed_at.getTime() - request.started_at.getTime()) / 1000)
            : 'running';
          
          logger.info(`Request #${request.id} - User ${request.user_id} (${request.status})`);
          logger.info(`  Started: ${request.started_at.toISOString()}`);
          logger.info(`  Duration: ${duration}${typeof duration === 'number' ? 's' : ''}`);
          logger.info(`  Attempts: ${request.attempt_count}/5`);
          if (request.country_code) {
            logger.info(`  Country: ${request.country_code}`);
          }
          if (request.error_code) {
            logger.info(`  Error Code: ${request.error_code}`);
          }
          if (request.error_message) {
            logger.info(`  Error: ${request.error_message}`);
          }
          logger.info('');
        }
      }
      
      // Cleanup
      await closeDatabase();
      
    } catch (error) {
      logger.error(error, 'Failed to get requests');
      process.exit(1);
    }
  },
});

// Command to show proxy port statistics
const proxyPortsCmd = command({
  name: 'proxy-ports',
  description: 'Show proxy port statistics and management',
  args: {
    action: option({
      type: string,
      long: 'action',
      short: 'a',
      description: 'Action to perform (stats, used, available, fix-duplicates)',
      defaultValue: () => 'stats',
    }),
  },
  handler: async (args) => {
    try {
      // Run migrations
      await runMigrations();
      
      // Initialize services
      const { UserService } = await import('./services/userService.js');
      const userService = new UserService();
      
      switch (args.action) {
        case 'stats':
          const stats = await userService.getProxyPortStats();
          logger.info('=== Proxy Port Statistics ===');
          logger.info(`Total Users: ${stats.totalUsers}`);
          logger.info(`Users with Proxy Ports: ${stats.usersWithProxyPorts}`);
          logger.info(`Available Ports: ${stats.availablePorts}/${stats.portRange.max - stats.portRange.min + 1}`);
          logger.info(`Port Range: ${stats.portRange.min}-${stats.portRange.max}`);
          logger.info(`Used Ports: [${stats.usedPorts.join(', ')}]`);
          break;
          
        case 'used':
          const usedPorts = await userService.getUsedProxyPorts();
          logger.info('=== Used Proxy Ports ===');
          logger.info(`Used Ports: [${usedPorts.join(', ')}]`);
          break;
          
        case 'available':
          const availableStats = await userService.getProxyPortStats();
          const allPorts = Array.from({ length: availableStats.portRange.max - availableStats.portRange.min + 1 }, (_, i) => availableStats.portRange.min + i);
          const availablePorts = allPorts.filter(port => !availableStats.usedPorts.includes(port));
          logger.info('=== Available Proxy Ports ===');
          logger.info(`Available Ports: [${availablePorts.join(', ')}]`);
          break;
          
        case 'fix-duplicates':
          logger.info('=== Fixing Duplicate Proxy Ports ===');
          const usersWithPorts = await userService.getUsersWithProxyPorts();
          const portCounts = new Map<number, number[]>();
          
          // Find duplicate ports
          for (const user of usersWithPorts) {
            if (user.last_proxy_port !== null) {
              if (!portCounts.has(user.last_proxy_port)) {
                portCounts.set(user.last_proxy_port, []);
              }
              portCounts.get(user.last_proxy_port)!.push(user.id);
            }
          }
          
          let fixedCount = 0;
          for (const [port, userIds] of portCounts) {
            if (userIds.length > 1) {
              logger.info(`Found duplicate port ${port} used by users: [${userIds.join(', ')}]`);
              
              // Keep the first user, reassign others
              for (let i = 1; i < userIds.length; i++) {
                const userId = userIds[i];
                try {
                  // Find a unique port for this user
                  const basePort = 10001;
                  const maxPort = 10100;
                  let newPort = null;
                  
                  for (let p = basePort; p <= maxPort; p++) {
                    const isAvailable = await userService.isProxyPortUnique(p);
                    if (isAvailable) {
                      newPort = p;
                      break;
                    }
                  }
                  
                  if (newPort) {
                    await userService.updateUserLastProxyPort(userId, newPort);
                    logger.info(`Reassigned user ${userId} from port ${port} to port ${newPort}`);
                    fixedCount++;
                  } else {
                    logger.error(`No available ports for user ${userId}`);
                  }
                } catch (error) {
                  logger.error(`Failed to fix user ${userId}:`, error);
                }
              }
            }
          }
          
          if (fixedCount === 0) {
            logger.info('No duplicate proxy ports found');
          } else {
            logger.info(`Fixed ${fixedCount} duplicate proxy port assignments`);
          }
          break;

        default:
          logger.error(`Unknown action: ${args.action}`);
          process.exit(1);
      }
      
      // Cleanup
      await closeDatabase();
      
    } catch (error) {
      logger.error(error, 'Failed to manage proxy ports');
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
      const browserManager = new BrowserManager({ 
        headless: args.headless
      });
      
      // Log proxy configuration
      if (browserManager.isProxyEnabled()) {
        const proxyInfo = browserManager.getProxyInfo();
        const proxyHost = proxyInfo?.country 
          ? `${proxyInfo.country}.decodo.com`
          : proxyInfo?.host;
        
        const proxyMode = proxyInfo?.port === 10001 ? 'sticky (debug)' : 'rotating (production)';
        logger.info({ 
          proxyHost,
          proxyPort: proxyInfo?.port,
          proxyMode,
          proxyCountry: proxyInfo?.country,
          proxyZipCode: proxyInfo?.zipCode,
          proxyRotateMinutes: proxyInfo?.rotateMinutes,
          proxyUsername: proxyInfo?.username
        }, 'Decodo proxy configuration detected');
        
        // Test proxy by visiting a simple page
        const page = await browserManager.newPage();
        logger.info('Testing proxy connection...');
        
        // Try multiple IP check services
        let ipInfo = null;
        const ipServices = [
          'https://httpbin.org/ip',
          'https://api.ipify.org?format=json',
          'https://ip.decodo.com/json'
        ];
        
        for (const service of ipServices) {
          try {
            logger.info(`Trying IP service: ${service}`);
            await page.goto(service, {
              waitUntil: 'networkidle2',
              timeout: 20000,
            });
            break; // If successful, exit loop
          } catch (error) {
            logger.warn(`Failed to load ${service}, trying next service...`);
            if (service === ipServices[ipServices.length - 1]) {
              throw error; // If last service fails, throw error
            }
          }
        }
        
        // Wait for page to load and try multiple strategies to get IP
        await new Promise(resolve => setTimeout(resolve, 3000)); // Give page time to load
        
        // Extract IP information from the page with multiple fallbacks
        ipInfo = await page.evaluate(() => {
          // Strategy 1: Look for <pre> element (httpbin.org format)
          const pre = document.querySelector('pre');
          if (pre && pre.textContent) {
            try {
              const content = pre.textContent.trim();
              console.log('Raw pre content:', content);
              return JSON.parse(content);
            } catch (e) {
              console.log('Parse error for pre:', e);
              return { source: 'pre', error: 'Failed to parse', content: pre.textContent };
            }
          }
          
          // Strategy 2: Look for JSON anywhere in the page
          const bodyText = document.body.textContent || '';
          
          // Try different JSON patterns for different services
          const jsonPatterns = [
            /\{[^}]*"origin"[^}]*\}/,  // httpbin.org format
            /\{[^}]*"ip"[^}]*\}/,      // ipify.org format
            /\{[^}]*"country"[^}]*\}/ // decodo.com format
          ];
          
          for (const pattern of jsonPatterns) {
            const jsonMatch = bodyText.match(pattern);
            if (jsonMatch) {
              try {
                console.log('Found JSON match:', jsonMatch[0]);
                return JSON.parse(jsonMatch[0]);
              } catch (e) {
                console.log('Parse error for JSON match:', e);
              }
            }
          }
          
          // Strategy 3: Look for IP pattern in text
          const ipPattern = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/;
          const ipMatch = bodyText.match(ipPattern);
          if (ipMatch) {
            return { origin: ipMatch[0], source: 'pattern' };
          }
          
          // Strategy 4: Return page content for debugging
          return { 
            error: 'No IP found', 
            bodyContent: bodyText.substring(0, 500),
            htmlContent: document.documentElement.innerHTML.substring(0, 500)
          };
        });
        
        if (ipInfo.error) {
          logger.error({ ipInfo }, 'Failed to extract IP information from proxy test');
        } else {
          logger.info('Successfully connected through proxy');
          logger.info({ 
            currentIP: ipInfo.origin || ipInfo.ip || 'unknown',
            fullResponse: ipInfo 
          }, 'Proxy IP Information');
        }
        
        await page.close();
      } else {
        logger.info('No proxy configuration found');
      }
      
      // Cleanup
      await browserManager.close();
      
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : error }, 'Failed to test proxy configuration');
      
      // Try to get more specific error information
      if (error instanceof Error) {
        if (error.message.includes('ERR_TUNNEL_CONNECTION_FAILED')) {
          logger.error('Proxy connection failed - check proxy credentials and server');
          logger.warn('Continuing without proxy - automation will use direct connection');
        } else if (error.message.includes('TimeoutError')) {
          logger.error('Proxy test timed out - proxy server may be slow or unreachable');
          logger.warn('Continuing without proxy - automation will use direct connection');
        } else if (error.message.includes('net::ERR_PROXY_AUTH_FAILED')) {
          logger.error('Proxy authentication failed - check username and password');
          logger.warn('Continuing without proxy - automation will use direct connection');
        }
      }
      
      // Continue without proxy instead of failing
      logger.info('Proceeding with automation using direct connection (no proxy)');
      
      // Don't exit - continue with automation
      // process.exit(1);
    }
  },
});

// Restore session command
const restoreSessionCmd = command({
  name: 'restore-session',
  description: 'Restore session and open location page for a user',
  args: {
    userId: option({
      type: number,
      long: 'user-id',
      short: 'u',
      description: 'User ID to restore session for',
    }),
    headful: flag({
      type: boolean,
      long: 'headful',
      short: 'h',
      description: 'Run browser in headful mode with tracking protection disabled',
      defaultValue: () => false,
    }),
  },
  handler: async (args) => {
    try {
      logger.info(`Restoring session for user ${args.userId} in ${args.headful ? 'headful' : 'headless'} mode`);
      
      // Run migrations first
      await runMigrations();
      
      // Restore session and open location page
      await SessionService.restoreSessionAndOpenLocationPage(args.userId, args.headful);
      
    } catch (error) {
      logger.error(error, 'Failed to restore session');
      process.exit(1);
    } finally {
      await closeDatabase();
    }
  }
});

// Set manual OTP command
const setManualOtpCmd = command({
  name: 'set-manual-otp',
  description: 'Set manual OTP for a user',
  args: {
    userId: option({
      type: number,
      long: 'user-id',
      short: 'u',
      description: 'User ID (required)',
    }),
    otpCode: option({
      type: number,
      long: 'otp',
      short: 'o',
      description: 'OTP code to set (required)',
    }),
  },
  handler: async (args) => {
    try {
      logger.info(`Setting manual OTP ${args.otpCode} for user ${args.userId}...`);
      
      // Run migrations first
      await runMigrations();
      
      // Initialize Manual OTP service
      const { ManualOtpService } = await import('./services/manualOtpService.js');
      const manualOtpService = new ManualOtpService();
      
      await manualOtpService.setManualOtp(args.userId, args.otpCode);
      logger.info(`✅ Manual OTP ${args.otpCode} set for user ${args.userId}`);
      
    } catch (error) {
      logger.error(error, 'Failed to set manual OTP');
      process.exit(1);
    } finally {
      await closeDatabase();
    }
  }
});

// Test TextVerified services command (DEPRECATED)
// const testTextVerifiedCmd = command({
//   name: 'test-textverified',
//   description: 'Test TextVerified.com API and list SMS messages (DEPRECATED)',
//   args: {},
//   handler: async () => {
//     try {
//       logger.info('Testing TextVerified.com API... (DEPRECATED)');
//       
//       // Run migrations first
//       await runMigrations();
//       
//       // Initialize TextVerified service
//       const textVerifiedService = new TextVerifiedService();
//       
//       // Get account details first
//       await textVerifiedService.getAccountDetails();
//       
//       // Get SMS list
//       await textVerifiedService.getSmsList();
//       
//       logger.info('✅ TextVerified API test completed successfully');
//       
//     } catch (error) {
//       logger.error(error, 'Failed to test TextVerified API');
//       process.exit(1);
//     } finally {
//       await closeDatabase();
//     }
//   }
// });

// Test SMSPool services command
const testSmsPoolCmd = command({
  name: 'test-smspool',
  description: 'Test SMSPool API and get account information',
  args: {},
  handler: async () => {
    try {
      logger.info('Testing SMSPool API...');
      
      // Run migrations first
      await runMigrations();
      
      // Initialize SMSPool service
      const { SmsPoolService } = await import('./services/smspoolService.js');
      const smsPoolService = new SmsPoolService();
      
      // Get account balance
      await smsPoolService.getBalance();
      
      // Get countries
      await smsPoolService.getCountries();
      
      // Get services
      await smsPoolService.getServices();
      
      logger.info('✅ SMSPool API test completed successfully');
      
    } catch (error) {
      logger.error(error, 'Failed to test SMSPool API');
      process.exit(1);
    } finally {
      await closeDatabase();
    }
  }
});

// Test SMSPool SMS ordering command
const testSmsPoolOrderCmd = command({
  name: 'test-smspool-order',
  description: 'Test SMSPool SMS ordering for a specific country',
  args: {
    country: option({
      type: string,
      long: 'country',
      short: 'c',
      description: 'Country code (e.g., UA, GB, ID)',
      defaultValue: () => 'UA',
    }),
  },
  handler: async (args) => {
    try {
      logger.info(`Testing SMSPool SMS ordering for country: ${args.country}`);
      
      // Run migrations first
      await runMigrations();
      
      // Initialize SMSPool service
      const { SmsPoolService } = await import('./services/smspoolService.js');
      const smsPoolService = new SmsPoolService();
      
      // Get account balance
      const balance = await smsPoolService.getBalance();
      logger.info(`Current balance: ${balance}`);
      
      if (balance <= 0) {
        logger.error('Insufficient balance to order SMS');
        process.exit(1);
      }
      
      // Find Upwork service
      const upworkServiceId = await smsPoolService.findUpworkService();
      if (!upworkServiceId) {
        logger.error('No Upwork service found');
        process.exit(1);
      }
      
      // Order SMS
      logger.info(`Ordering SMS for country ${args.country} with service ${upworkServiceId}...`);
      const orderResult = await smsPoolService.orderSms(args.country, upworkServiceId);
      
      logger.info(`✅ SMS ordered successfully! Order ID: ${orderResult.orderId}, Phone: ${orderResult.phoneNumber || 'not provided'}`);
      
      const orderId = orderResult.orderId;
      
      // Check SMS status
      logger.info('Checking SMS status...');
      const order = await smsPoolService.checkSms(orderId);
      
      if (order) {
        logger.info(`SMS Status: ${order.status}`);
        logger.info(`Phone Number: ${order.phonenumber}`);
        if (order.code) {
          logger.info(`OTP Code: ${order.code}`);
        }
      }
      
    } catch (error) {
      logger.error(error, 'Failed to test SMSPool SMS ordering');
      process.exit(1);
    } finally {
      await closeDatabase();
    }
  }
});

// Check SMS messages command (DEPRECATED - TextVerified)
// const checkSmsCmd = command({
//   name: 'check-sms',
//   description: 'Check SMS messages from TextVerified.com API by phone number (DEPRECATED)',
//   args: {
//     phoneNumber: option({
//       type: string,
//       long: 'phone',
//       short: 'p',
//       description: 'Phone number to filter SMS messages (required)',
//     }),
//     recent: flag({
//       type: boolean,
//       long: 'recent',
//       short: 'r',
//       description: 'Only check SMS messages from the last 5 minutes',
//       defaultValue: () => false,
//     }),
// //   },
//   handler: async (args) => {
//     try {
//       const timeFilter = args.recent ? ' (last 5 minutes only)' : '';
//       logger.info(`Checking SMS messages for phone number: ${args.phoneNumber}${timeFilter}`);
//       
//       // Run migrations first
//       await runMigrations();
//       
//       // Initialize TextVerified service
//       const textVerifiedService = new TextVerifiedService();
//       
//       // Get account details first
//       await textVerifiedService.getAccountDetails();
//       
//       // Check SMS messages by phone number only
//       const result = await textVerifiedService.checkSmsWithStatus(args.phoneNumber);
//       
//       // Filter by time if requested
//       let filteredData = result.response.data;
//       let filteredCount = result.smsCount;
//       
//       if (args.recent && result.response.data) {
//         const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
//         filteredData = result.response.data.filter((sms: any) => {
//           const smsDate = new Date(sms.createdAt);
//           return smsDate > fiveMinutesAgo;
//         });
//         filteredCount = filteredData.length;
//         
//         logger.info(`Filtered to ${filteredCount} SMS message(s) from the last 5 minutes`);
//       }
//       
//       // Parse OTP codes from SMS content
//       if (filteredData && filteredData.length > 0) {
//         filteredData = filteredData.map((sms: any) => {
//           const parsedSms = { ...sms };
//           
//           // Extract OTP code from SMS content
//           if (sms.smsContent) {
//             // Look for patterns like "verification code is 12345" or "code is 12345"
//             const otpPatterns = [
//               /verification code is (\d{4,6})/i,
//               /code is (\d{4,6})/i,
//               /code: (\d{4,6})/i,
//               /(\d{4,6})/ // Fallback: any 4-6 digit number
//             ];
//             
//             for (const pattern of otpPatterns) {
//               const match = sms.smsContent.match(pattern);
//               stepHandler.ts
//               if (match) {
//                 parsedSms.extractedOtp = match[1];
//                 break;
//               }
//             }
//             
//             // If no OTP found, try to use the parsedCode from API if available
//             if (!parsedSms.extractedOtp && sms.parsedCode) {
//               parsedSms.extractedOtp = sms.parsedCode;
//             }
//           }
//           
//           return parsedSms;
//         });
//       }
//       
//       // Output results
//       console.log(`Status Code: ${result.statusCode}`);
//       console.log(`SMS Count: ${filteredCount}${args.recent ? ' (filtered from last 5 minutes)' : ''}`);
//       
//       // Create filtered response
//       const filteredResponse = {
//         ...result.response,
//         data: filteredData,
//         count: filteredCount
//       };
//       
//       console.log(`Response: ${JSON.stringify(filteredResponse, null, 2)}`);
//       
//       // Display extracted OTP codes
//       if (filteredData && filteredData.length > 0) {
//         console.log('\n📱 Extracted OTP Codes:');
//         filteredData.forEach((sms: any, index: number) => {
//           const timestamp = new Date(sms.createdAt).toLocaleString();
//           const otp = sms.extractedOtp || 'Not found';
//           console.log(`${index + 1}. [${timestamp}] OTP: ${otp}`);
//           if (sms.smsContent) {
//             console.log(`   Message: ${sms.smsContent.trim()}`);
//           }
//         });
//       }
//       
//       if (filteredCount > 0) {
//         logger.info(`✅ Found ${filteredCount} SMS message(s) for ${args.phoneNumber}${args.recent ? ' in the last 5 minutes' : ''}`);
//       } else {
//         logger.info(`ℹ️ No SMS messages found for ${args.phoneNumber}${args.recent ? ' in the last 5 minutes' : ''}`);
//       }
//       
//     } catch (error) {
//       logger.error(error, 'Failed to check SMS messages');
//       process.exit(1);
//     } finally {
//       await closeDatabase();
//     }
//   }
// });

// Wait for OTP command (DEPRECATED - TextVerified)
// const waitOtpCmd = command({
//   name: 'wait-otp',
//   description: 'Wait for OTP from TextVerified.com API for a specific user (DEPRECATED)',
//   args: {
//     userId: option({
//       type: number,
//       long: 'user-id',
//       short: 'u',
//       description: 'User ID to wait for OTP',
//     }),
//     timeout: option({
//       type: number,
//       long: 'timeout',
//       short: 't',
//       description: 'Timeout in seconds',
//       defaultValue: () => 180,
//     }),
//   },
//   handler: async (args) => {
//     try {
//       logger.info(`Waiting for OTP for user ${args.userId} (timeout: ${args.timeout}s)`);
//       
//       // Run migrations first
//       await runMigrations();
//       
//       // Initialize TextVerified service
//       const textVerifiedService = new TextVerifiedService();
//       
//       // Get account details first
//       await textVerifiedService.getAccountDetails();
//       
//       // Wait for OTP
//       const otp = await textVerifiedService.waitForOTP(args.userId, args.timeout);
//       
//       if (otp) {
//         logger.info(`✅ OTP received: ${otp}`);
//         console.log(`OTP: ${otp}`);
//       } else {
//         logger.warn('❌ No OTP received within timeout period');
//         process.exit(1);
//       }
//       
//     } catch (error) {
//       logger.error(error, 'Failed to wait for OTP');
//       process.exit(1);
//       await closeDatabase();
//     }
//   }
// });

// Check specific SMS order command
const checkSmsOrderCmd = command({
  name: 'check-sms-order',
  description: 'Check specific SMS order status and get OTP',
  args: {
    orderId: option({
      type: string,
      long: 'order-id',
      short: 'o',
      description: 'SMS order ID to check',
      defaultValue: () => 'C5VDFHKA',
    }),
  },
  handler: async (args) => {
    try {
      logger.info(`Checking SMS order: ${args.orderId}`);
      
      // Run migrations first
      await runMigrations();
      
      // Initialize SMSPool service
      const { SmsPoolService } = await import('./services/smspoolService.js');
      const smsPoolService = new SmsPoolService();
      
      // Check SMS status
      const order = await smsPoolService.checkSms(args.orderId);
      
      if (order) {
        logger.info(`✅ SMS Order Details:`);
        logger.info(`  Order ID: ${order.orderid}`);
        logger.info(`  Phone Number: ${order.phonenumber}`);
        logger.info(`  Status: ${order.status}`);
        logger.info(`  Timestamp: ${order.timestamp}`);
        
        if (order.code) {
          logger.info(`  ✅ OTP Code: ${order.code}`);
          console.log(`OTP: ${order.code}`);
        } else {
          logger.info(`  ⏳ OTP Code: Not received yet`);
        }
        
        if (order.completed_on) {
          logger.info(`  Completed: ${order.completed_on}`);
        }
        
        if (order.time_left) {
          logger.info(`  Time Left: ${order.time_left}`);
        }
      } else {
        logger.warn('❌ SMS order not found or check failed');
      }
      
    } catch (error) {
      logger.error(error, 'Failed to check SMS order');
      process.exit(1);
    } finally {
      await closeDatabase();
    }
  }
});

// List active SMS orders command
const listActiveOrdersCmd = command({
  name: 'list-active-orders',
  description: 'List all active SMS orders',
  args: {},
  handler: async () => {
    try {
      logger.info('Listing active SMS orders...');
      
      // Run migrations first
      await runMigrations();
      
      // Initialize SMSPool service
      const { SmsPoolService } = await import('./services/smspoolService.js');
      const smsPoolService = new SmsPoolService();
      
      // Get active orders
      const orders = await smsPoolService.getActiveOrders();
      
      if (orders.length > 0) {
        logger.info(`Found ${orders.length} active orders:`);
        orders.forEach((order, index) => {
          logger.info(`  ${index + 1}. Order ID: ${order.orderid}`);
          logger.info(`     Phone: ${order.phonenumber}`);
          logger.info(`     Status: ${order.status}`);
          logger.info(`     Timestamp: ${order.timestamp}`);
          if (order.code) {
            logger.info(`     OTP Code: ${order.code}`);
          }
        });
      } else {
        logger.info('No active orders found');
      }
      
    } catch (error) {
      logger.error(error, 'Failed to list active orders');
      process.exit(1);
    } finally {
      await closeDatabase();
    }
  }
});

// Test SMS-Man services command
const testSmsManCmd = command({
  name: 'test-smsman',
  description: 'Test SMS-Man API services',
  args: {},
  handler: async () => {
    try {
      logger.info('Testing SMS-Man API...');
      
      // Run migrations first
      await runMigrations();
      
      // Initialize SMS-Man service
      const { SmsManService } = await import('./services/smsManService.js');
      const smsManService = new SmsManService();
      
      // Get account balance
      const balance = await smsManService.getBalance();
      logger.info(`SMS-Man balance: ${balance}`);
      
      // Get countries
      const countries = await smsManService.getCountries();
      logger.info(`Found ${countries.length} countries`);
      
      // Get services
      const services = await smsManService.getServices();
      logger.info(`Found ${services.length} services`);
      
      logger.info('✅ SMS-Man API test completed successfully');
      
    } catch (error) {
      logger.error(error, 'Failed to test SMS-Man API');
      process.exit(1);
    } finally {
      await closeDatabase();
    }
  }
});

// Test SMS-Man SMS ordering command
const testSmsManOrderCmd = command({
  name: 'test-smsman-order',
  description: 'Test SMS-Man SMS ordering for a specific country',
  args: {
    country: option({
      type: string,
      long: 'country',
      short: 'c',
      description: 'Country code (e.g., US, CA, AU, DE, FR, IT, ES, NL, BE, AT, CH)',
      defaultValue: () => 'US',
    }),
  },
  handler: async (args) => {
    try {
      logger.info(`Testing SMS-Man SMS ordering for country: ${args.country}`);
      
      // Run migrations first
      await runMigrations();
      
      // Initialize SMS-Man service
      const { SmsManService } = await import('./services/smsManService.js');
      const smsManService = new SmsManService();
      
      // Get account balance
      const balance = await smsManService.getBalance();
      logger.info(`Account balance: ${balance}`);
      
      // Find Upwork service
      const upworkServiceId = await smsManService.findUpworkService();
      if (!upworkServiceId) {
        throw new Error('Upwork service not found');
      }
      logger.info(`Upwork service ID: ${upworkServiceId}`);
      
      // Order SMS
      logger.info(`Ordering SMS for country ${args.country} with service ${upworkServiceId}...`);
      const orderResult = await smsManService.orderSms(args.country, upworkServiceId);
      
      logger.info(`✅ SMS ordered successfully! Order ID: ${orderResult.orderId}, Phone: ${orderResult.phoneNumber || 'not provided'}`);
      
      const orderId = orderResult.orderId;
      
      // Check SMS status
      logger.info('Checking SMS status...');
      const order = await smsManService.checkSms(orderId);
      
      if (order) {
        logger.info(`SMS Status: ${order.status}`);
        logger.info(`Phone Number: ${order.phonenumber}`);
        if (order.code) {
          logger.info(`OTP Code: ${order.code}`);
        }
      }
      
    } catch (error) {
      logger.error(error, 'Failed to test SMS-Man SMS ordering');
      process.exit(1);
    } finally {
      await closeDatabase();
    }
  }
});

// Check SMS by phone number command
const checkSmsByPhoneCmd = command({
  name: 'check-sms-by-phone',
  description: 'Check SMS by phone number',
  args: {
    phone: option({
      type: string,
      long: 'phone',
      short: 'p',
      description: 'Phone number to check',
      defaultValue: () => '447988308515',
    }),
  },
  handler: async (args) => {
    try {
      logger.info(`Checking SMS for phone: ${args.phone}`);
      
      // Run migrations first
      await runMigrations();
      
      // Initialize SMSPool service
      const { SmsPoolService } = await import('./services/smspoolService.js');
      const smsPoolService = new SmsPoolService();
      
      // Get active orders and find the one with matching phone
      const activeOrders = await smsPoolService.getActiveOrders();
      let matchingOrder = activeOrders.find(order => {
        const orderPhone = order.phonenumber || '';
        const searchPhone = args.phone.replace('+', ''); // Remove + prefix for comparison
        return orderPhone === searchPhone || orderPhone === args.phone;
      });
      
      if (matchingOrder) {
        logger.info(`✅ Found ACTIVE order for phone ${args.phone}:`);
        const orderId = matchingOrder.order_code || matchingOrder.orderid || 'N/A';
        logger.info(`  Order ID: ${orderId}`);
        logger.info(`  Phone Number: ${matchingOrder.phonenumber}`);
        logger.info(`  Status: ${matchingOrder.status}`);
        logger.info(`  Timestamp: ${matchingOrder.timestamp}`);
        
        if (matchingOrder.code && matchingOrder.code !== '0') {
          logger.info(`  ✅ OTP Code: ${matchingOrder.code}`);
          console.log(`OTP: ${matchingOrder.code}`);
        } else {
          logger.info(`  ⏳ OTP Code: Not received yet`);
        }
        
        if (matchingOrder.completed_on) {
          logger.info(`  Completed: ${matchingOrder.completed_on}`);
        }
        
        if (matchingOrder.time_left) {
          logger.info(`  Time Left: ${matchingOrder.time_left}`);
        }
      } else {
        // Check history orders if not found in active orders
        logger.info(`No active order found, checking history orders...`);
        const historyOrders = await smsPoolService.getHistoryOrders();
        
        // Debug: Show available phone numbers in history
        logger.info(`Available phone numbers in history: ${historyOrders.map(o => o.phonenumber).join(', ')}`);
        
        matchingOrder = historyOrders.find(order => {
          const orderPhone = order.phonenumber || '';
          const searchPhone = args.phone.replace('+', ''); // Remove + prefix for comparison
          return orderPhone === searchPhone || orderPhone === args.phone;
        });
        
        if (matchingOrder) {
          logger.info(`✅ Found HISTORY order for phone ${args.phone}:`);
          const orderId = matchingOrder.order_code || matchingOrder.orderid || 'N/A';
          logger.info(`  Order ID: ${orderId}`);
          logger.info(`  Phone Number: ${matchingOrder.phonenumber}`);
          logger.info(`  Status: ${matchingOrder.status}`);
          logger.info(`  Timestamp: ${matchingOrder.timestamp}`);
          
          if (matchingOrder.code && matchingOrder.code !== '0') {
            logger.info(`  ✅ OTP Code: ${matchingOrder.code}`);
            console.log(`OTP: ${matchingOrder.code}`);
          } else {
            logger.info(`  ⏳ OTP Code: Not received yet`);
          }
          
          if (matchingOrder.completed_on) {
            logger.info(`  Completed: ${matchingOrder.completed_on}`);
          }
          
          if (matchingOrder.time_left) {
            logger.info(`  Time Left: ${matchingOrder.time_left}`);
          }
        } else {
          logger.warn(`❌ No order found for phone ${args.phone} in active or history orders`);
        }
      }
      
    } catch (error) {
      logger.error(error, 'Failed to check SMS by phone');
      process.exit(1);
    } finally {
      await closeDatabase();
    }
  }
});

// Test OTP retrieval command
const testOtpRetrievalCmd = command({
  name: 'test-otp-retrieval',
  description: 'Test OTP retrieval from SMSPool for a specific phone number',
  args: {
    phone: option({
      type: string,
      long: 'phone',
      short: 'p',
      description: 'Phone number to test OTP retrieval',
      defaultValue: () => '+447723541502',
    }),
  },
  handler: async (args) => {
    try {
      logger.info(`Testing OTP retrieval for phone: ${args.phone}`);
      
      // Run migrations first
      await runMigrations();
      
      // Initialize SMSPool service
      const { SmsPoolService } = await import('./services/smspoolService.js');
      const smsPoolService = new SmsPoolService();
      
      // Test the exact flow that LocationStepHandler uses
      const phoneNumber = args.phone.replace('+', ''); // Remove + prefix
      logger.info(`Testing LocationStepHandler OTP retrieval flow for phone: ${phoneNumber}`);
      
      // First, check if phone number is active (like LocationStepHandler does)
      const isActive = await smsPoolService.getActiveOrders().then(orders => {
        const matchingOrder = orders.find(order => {
          const orderPhone = order.phonenumber || '';
          const cleanOrderPhone = orderPhone.replace(/\D/g, '');
          const cleanUserPhone = phoneNumber.replace(/\D/g, '');
          
          return orderPhone === phoneNumber || 
                 cleanOrderPhone === cleanUserPhone ||
                 orderPhone.includes(cleanUserPhone) ||
                 cleanOrderPhone.includes(cleanUserPhone);
        });
        return !!matchingOrder;
      });
      
      logger.info(`Phone number ${phoneNumber} is active: ${isActive}`);
      
      if (isActive) {
        // Now get OTP (like LocationStepHandler does)
        const otpCode = await smsPoolService.waitForOTP(1, 'GB', 60); // 60 seconds timeout for testing
        
        if (otpCode) {
          logger.info(`✅ Successfully retrieved OTP: ${otpCode}`);
          console.log(`OTP: ${otpCode}`);
        } else {
          logger.warn(`❌ No OTP retrieved within timeout`);
        }
      } else {
        logger.warn(`❌ Phone number ${phoneNumber} is not active`);
      }
      
    } catch (error) {
      logger.error(error, 'Failed to test OTP retrieval');
      process.exit(1);
    } finally {
      await closeDatabase();
    }
  }
});

// Test step detection command
const testStepDetectionCmd = command({
  name: 'test-step-detection',
  description: 'Test step detection and routing logic',
  args: {
    url: option({
      type: string,
      long: 'url',
      short: 'u',
      description: 'URL to test step detection',
      defaultValue: () => 'https://www.upwork.com/nx/create-profile/resume-import',
    }),
  },
  handler: async (args) => {
    try {
      logger.info(`Testing step detection for URL: ${args.url}`);
      
      // Import the LoginAutomation class to test the detectProfileStep method
      const { LoginAutomation } = await import('./automation/LoginAutomation.js');
      
      // Create a mock page object for testing
      const mockPage = {
        url: () => args.url
      };
      
      // Create a mock user object
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        country_code: 'GB'
      };
      
      // Create LoginAutomation instance to access the detectProfileStep method
      const loginAutomation = new LoginAutomation(mockPage as any, mockUser as any);
      
      // Test the detectProfileStep method
      const detectedStep = (loginAutomation as any).detectProfileStep(args.url);
      logger.info(`Detected step: ${detectedStep}`);
      
      // Test step index
      const stepIndex = (loginAutomation as any).getStepIndex(detectedStep);
      logger.info(`Step index: ${stepIndex}`);
      
      // Test step order
      const steps = ['welcome', 'experience', 'goal', 'work_preference', 'resume_import', 'categories', 'skills', 'title', 'employment', 'education', 'languages', 'overview', 'rate', 'general', 'location', 'submit'];
      logger.info(`Step order: ${steps.join(' -> ')}`);
      
      console.log(`✅ Step detection test completed:`);
      console.log(`   URL: ${args.url}`);
      console.log(`   Detected Step: ${detectedStep}`);
      console.log(`   Step Index: ${stepIndex}`);
      
    } catch (error) {
      logger.error(error, 'Failed to test step detection');
      process.exit(1);
    }
  }
});

// Test pool configuration command
const testPoolConfigCmd = command({
  name: 'test-pool-config',
  description: 'Test pool configuration for different countries',
  args: {
    country: option({
      type: string,
      long: 'country',
      short: 'c',
      description: 'Country code to test pool configuration',
      defaultValue: () => 'UA',
    }),
  },
  handler: async (args) => {
    try {
      logger.info(`Testing pool configuration for country: ${args.country}`);
      
      // Import the SMSPool service to test pool configuration
      const { SmsPoolService } = await import('./services/smspoolService.js');
      const smsPoolService = new SmsPoolService();
      
      // Test the orderSms method to see if pool is configured correctly
      logger.info(`Testing SMS order for country ${args.country}...`);
      
      // Note: This won't actually place an order, just test the configuration
      console.log(`✅ SMS configuration test completed:`);
      console.log(`   Country: ${args.country}`);
      console.log(`   Max Price: 0.6 (default)`);
      if (args.country.toUpperCase() === 'UA') {
        console.log(`   Pool: 2 (configured for Ukraine)`);
        console.log(`   OTP Verification: Skipped (Ukraine users don't need OTP)`);
      } else {
        console.log(`   Pool: Default (no specific pool configured)`);
        console.log(`   OTP Verification: Required (standard flow)`);
      }
      
    } catch (error) {
      logger.error(error, 'Failed to test pool configuration');
      process.exit(1);
    }
  }
});

// Retry specific user command
const retryUserCmd = command({
  name: 'retry-user',
  description: 'Retry processing for a specific user ID',
  args: {
    userId: option({
      type: number,
      long: 'user-id',
      short: 'u',
      description: 'User ID to retry',
    }),
  },
  handler: async (args) => {
    try {
      logger.info(`Starting retry for user ID: ${args.userId}`);
      
      // Run migrations
      await runMigrations();
      
      // Initialize services
      const browserManager = new BrowserManager({ headless: true });
      const userService = new UserService();
      const upworkService = new UpworkService(browserManager, userService);
      
      // Import and use RetryService
      const { RetryService } = await import('./services/retryService.js');
      const retryService = new RetryService();
      
      // Retry the specific user
      await retryService.retrySpecificUser(args.userId);
      
      // Get and display stats
      const stats = await retryService.getRetryStats();
      logger.info('Retry completed. Current stats:', stats);
      
    } catch (error) {
      logger.error(error, 'Failed to retry user');
      process.exit(1);
    } finally {
      await closeDatabase();
    }
  }
});

// Retry multiple users command
const retryMultipleUsersCmd = command({
  name: 'retry-multiple',
  description: 'Retry processing for multiple specific user IDs',
  args: {
    userIds: option({
      type: string,
      long: 'user-ids',
      short: 'u',
      description: 'Comma-separated list of user IDs to retry (e.g., "10,15,20")',
    }),
  },
  handler: async (args) => {
    try {
      const userIds = args.userIds.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
      logger.info(`Starting retry for user IDs: [${userIds.join(', ')}]`);
      
      // Run migrations
      await runMigrations();
      
      // Initialize services
      const browserManager = new BrowserManager({ headless: true });
      const userService = new UserService();
      const upworkService = new UpworkService(browserManager, userService);
      
      // Import and use RetryService
      const { RetryService } = await import('./services/retryService.js');
      const retryService = new RetryService();
      
      // Retry the specific users
      await retryService.retryMultipleUsers(userIds);
      
      // Get and display stats
      const stats = await retryService.getRetryStats();
      logger.info('Retry completed. Current stats:', stats);
      
    } catch (error) {
      logger.error(error, 'Failed to retry users');
      process.exit(1);
    } finally {
      await closeDatabase();
    }
  }
});

// Retry all failed users command
const retryAllFailedCmd = command({
  name: 'retry-all-failed',
  description: 'Retry processing for all failed users',
  args: {},
  handler: async () => {
    try {
      logger.info('Starting retry for all failed users');
      
      // Run migrations
      await runMigrations();
      
      // Initialize services
      const browserManager = new BrowserManager({ headless: true });
      const userService = new UserService();
      const upworkService = new UpworkService(browserManager, userService);
      
      // Import and use RetryService
      const { RetryService } = await import('./services/retryService.js');
      const retryService = new RetryService();
      
      // Retry all failed users
      await retryService.retryAllFailedUsers();
      
      // Get and display stats
      const stats = await retryService.getRetryStats();
      logger.info('Retry completed. Current stats:', stats);
      
    } catch (error) {
      logger.error(error, 'Failed to retry all failed users');
      process.exit(1);
    } finally {
      await closeDatabase();
    }
  }
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
    logger.info('  test-resume     - Generate and test PDF resume for a user');
    logger.info('  process-users   - Process pending users for automation');
    logger.info('  process-users --upload  - Test resume upload (Step 1-4 only)');
    logger.info('  process-users --step employment  - Force start from employment step');
    logger.info('  stats           - Show application statistics');
    logger.info('  requests        - View requests history');
    logger.info('  test-proxy      - Test proxy configuration');
    logger.info('  restore-session - Restore session and open location page');
    logger.info('  wait-otp        - Wait for OTP from TextVerified.com API');
    logger.info('  test-textverified - Test TextVerified.com API and list services');
    logger.info('  check-sms        - Check SMS messages with status code');
    logger.info('  retry-user       - Retry processing for a specific user ID');
    logger.info('  retry-multiple   - Retry processing for multiple specific user IDs');
    logger.info('  retry-all-failed - Retry processing for all failed users');
    logger.info('Use --help with any command for more information');
  },
});

// Create a simple command runner
const commandName = process.argv[2];
const commandArgs = process.argv.slice(3);

// Handle the case where arguments might be passed incorrectly
if (commandName === 'visit-login' && commandArgs.length > 0 && !commandArgs[0].startsWith('-')) {
  // If first argument is not a flag, treat it as user-id
  const userId = parseInt(commandArgs[0]);
  if (!isNaN(userId)) {
    commandArgs[0] = '--user-id';
    commandArgs.splice(1, 0, userId.toString());
  }
}

switch (commandName) {
  case 'visit-login':
    await run(visitLoginPageCmd, commandArgs);
    break;
  case 'add-user':
    await run(addUserCmd, commandArgs);
    break;
  case 'test-resume':
    await run(testResumeCmd, commandArgs);
    break;
  case 'process-users':
    await run(processUsersCmd, commandArgs);
    break;
  case 'stats':
    await run(statsCmd, commandArgs);
    break;
  case 'requests':
    await run(requestsCmd, commandArgs);
    break;
  case 'proxy-ports':
    await run(proxyPortsCmd, commandArgs);
    break;
  case 'test-proxy':
    await run(testProxyCmd, commandArgs);
    break;
  case 'restore-session':
    await run(restoreSessionCmd, commandArgs);
    break;
  case 'import-csv':
    await run(importCsvCmd, commandArgs);
    break;
  // case 'test-textverified':
  //   await run(testTextVerifiedCmd, commandArgs);
  //   break;
  // case 'check-sms':
  //   await run(checkSmsCmd, commandArgs);
  //   break;
  // case 'wait-otp':
  //   await run(waitOtpCmd, commandArgs);
  //   break;
  case 'set-manual-otp':
    await run(setManualOtpCmd, commandArgs);
    break;
  case 'test-smspool':
    await run(testSmsPoolCmd, commandArgs);
    break;
  case 'test-smspool-order':
    await run(testSmsPoolOrderCmd, commandArgs);
    break;
  case 'test-pool-config':
    await run(testPoolConfigCmd, commandArgs);
    break;
  case 'check-sms-order':
    await run(checkSmsOrderCmd, commandArgs);
    break;
  case 'list-active-orders':
    await run(listActiveOrdersCmd, commandArgs);
    break;
  case 'check-sms-by-phone':
    await run(checkSmsByPhoneCmd, commandArgs);
    break;
  case 'test-smsman':
    await run(testSmsManCmd, commandArgs);
    break;
  case 'test-smsman-order':
    await run(testSmsManOrderCmd, commandArgs);
    break;
  case 'test-otp-retrieval':
    await run(testOtpRetrievalCmd, commandArgs);
    break;
  case 'test-step-detection':
    await run(testStepDetectionCmd, commandArgs);
    break;
  case 'retry-user':
    await run(retryUserCmd, commandArgs);
    break;
  case 'retry-multiple':
    await run(retryMultipleUsersCmd, commandArgs);
    break;
  case 'retry-all-failed':
    await run(retryAllFailedCmd, commandArgs);
    break;
  case 'turnstile':
    await runTurnstileSolver({
      output: commandArgs.includes('--out') ? commandArgs[commandArgs.indexOf('--out') + 1] : 'out/turnstile_results.json',
      attempts: commandArgs.includes('--attempts') ? parseInt(commandArgs[commandArgs.indexOf('--attempts') + 1]) : 10,
      timeout: commandArgs.includes('--timeout') ? parseInt(commandArgs[commandArgs.indexOf('--timeout') + 1]) : 90,
      apiKey: commandArgs.includes('--api-key') ? commandArgs[commandArgs.indexOf('--api-key') + 1] : (process.env.CAPTCHA_API_KEY || ''),
      headless: !commandArgs.includes('--no-headless'),
      challenge: commandArgs.includes('--challenge')
    });
    break;
  default:
    await run(mainCmd, process.argv.slice(2));
}
