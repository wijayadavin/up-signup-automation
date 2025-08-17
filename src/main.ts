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
import { TextVerifiedService } from './services/textVerifiedService.js';
import fs from 'fs';

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
    debug: flag({
      type: boolean,
      long: 'debug',
      short: 'd',
      description: 'Debug mode: check login status only (no automation)',
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
        headless: args.headless
      });
      const userService = new UserService();
      upworkService = new UpworkService(browserManager, userService);
      
      // Visit login page
      logger.info(`Keep open mode: ${args.keepOpen}, Debug mode: ${args.debug}`);
      
      let success: boolean;
      if (args.debug) {
        success = await upworkService.checkLoginStatus(args.keepOpen);
      } else {
        success = await upworkService.visitLoginPage(args.keepOpen);
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
      if (args.upload) {
        logger.info('Upload mode enabled: will stop after Step 4 (Resume Import)');
        if (args.noStealth) {
          logger.info('No-stealth mode enabled: using normal browser behavior for debugging');
        }
        if (args.restoreSession) {
          logger.info('Restore-session mode enabled: will reuse existing sessions');
        }
        await upworkService.processPendingUsers(args.limit, { 
          uploadOnly: true,
          restoreSession: args.restoreSession
        });
      } else {
        if (args.noStealth) {
          logger.info('No-stealth mode enabled: using normal browser behavior for debugging');
        }
        if (args.restoreSession) {
          logger.info('Restore-session mode enabled: will reuse existing sessions');
        }
        await upworkService.processPendingUsers(args.limit, {
          restoreSession: args.restoreSession
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
        } else if (error.message.includes('TimeoutError')) {
          logger.error('Proxy test timed out - proxy server may be slow or unreachable');
        } else if (error.message.includes('net::ERR_PROXY_AUTH_FAILED')) {
          logger.error('Proxy authentication failed - check username and password');
        }
      }
      
      process.exit(1);
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

// Test TextVerified services command
const testTextVerifiedCmd = command({
  name: 'test-textverified',
  description: 'Test TextVerified.com API and list SMS messages',
  args: {},
  handler: async () => {
    try {
      logger.info('Testing TextVerified.com API...');
      
      // Run migrations first
      await runMigrations();
      
      // Initialize TextVerified service
      const textVerifiedService = new TextVerifiedService();
      
      // Get account details first
      await textVerifiedService.getAccountDetails();
      
      // Get SMS list
      await textVerifiedService.getSmsList();
      
      logger.info('✅ TextVerified API test completed successfully');
      
    } catch (error) {
      logger.error(error, 'Failed to test TextVerified API');
      process.exit(1);
    } finally {
      await closeDatabase();
    }
  }
});

// Check SMS messages command
const checkSmsCmd = command({
  name: 'check-sms',
  description: 'Check SMS messages from TextVerified.com API by phone number',
  args: {
    phoneNumber: option({
      type: string,
      long: 'phone',
      short: 'p',
      description: 'Phone number to filter SMS messages (required)',
    }),
    recent: flag({
      type: boolean,
      long: 'recent',
      short: 'r',
      description: 'Only check SMS messages from the last 5 minutes',
      defaultValue: () => false,
    }),
  },
  handler: async (args) => {
    try {
      const timeFilter = args.recent ? ' (last 5 minutes only)' : '';
      logger.info(`Checking SMS messages for phone number: ${args.phoneNumber}${timeFilter}`);
      
      // Run migrations first
      await runMigrations();
      
      // Initialize TextVerified service
      const textVerifiedService = new TextVerifiedService();
      
      // Get account details first
      await textVerifiedService.getAccountDetails();
      
      // Check SMS messages by phone number only
      const result = await textVerifiedService.checkSmsWithStatus(args.phoneNumber);
      
      // Filter by time if requested
      let filteredData = result.response.data;
      let filteredCount = result.smsCount;
      
      if (args.recent && result.response.data) {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        filteredData = result.response.data.filter((sms: any) => {
          const smsDate = new Date(sms.createdAt);
          return smsDate > fiveMinutesAgo;
        });
        filteredCount = filteredData.length;
        
        logger.info(`Filtered to ${filteredCount} SMS message(s) from the last 5 minutes`);
      }
      
      // Parse OTP codes from SMS content
      if (filteredData && filteredData.length > 0) {
        filteredData = filteredData.map((sms: any) => {
          const parsedSms = { ...sms };
          
          // Extract OTP code from SMS content
          if (sms.smsContent) {
            // Look for patterns like "verification code is 12345" or "code is 12345"
            const otpPatterns = [
              /verification code is (\d{4,6})/i,
              /code is (\d{4,6})/i,
              /code: (\d{4,6})/i,
              /(\d{4,6})/ // Fallback: any 4-6 digit number
            ];
            
            for (const pattern of otpPatterns) {
              const match = sms.smsContent.match(pattern);
              if (match) {
                parsedSms.extractedOtp = match[1];
                break;
              }
            }
            
            // If no OTP found, try to use the parsedCode from API if available
            if (!parsedSms.extractedOtp && sms.parsedCode) {
              parsedSms.extractedOtp = sms.parsedCode;
            }
          }
          
          return parsedSms;
        });
      }
      
      // Output results
      console.log(`Status Code: ${result.statusCode}`);
      console.log(`SMS Count: ${filteredCount}${args.recent ? ' (filtered from last 5 minutes)' : ''}`);
      
      // Create filtered response
      const filteredResponse = {
        ...result.response,
        data: filteredData,
        count: filteredCount
      };
      
      console.log(`Response: ${JSON.stringify(filteredResponse, null, 2)}`);
      
      // Display extracted OTP codes
      if (filteredData && filteredData.length > 0) {
        console.log('\n📱 Extracted OTP Codes:');
        filteredData.forEach((sms: any, index: number) => {
          const timestamp = new Date(sms.createdAt).toLocaleString();
          const otp = sms.extractedOtp || 'Not found';
          console.log(`${index + 1}. [${timestamp}] OTP: ${otp}`);
          if (sms.smsContent) {
            console.log(`   Message: ${sms.smsContent.trim()}`);
          }
        });
      }
      
      if (filteredCount > 0) {
        logger.info(`✅ Found ${filteredCount} SMS message(s) for ${args.phoneNumber}${args.recent ? ' in the last 5 minutes' : ''}`);
      } else {
        logger.info(`ℹ️ No SMS messages found for ${args.phoneNumber}${args.recent ? ' in the last 5 minutes' : ''}`);
      }
      
    } catch (error) {
      logger.error(error, 'Failed to check SMS messages');
      process.exit(1);
    } finally {
      await closeDatabase();
    }
  }
});

// Wait for OTP command
const waitOtpCmd = command({
  name: 'wait-otp',
  description: 'Wait for OTP from TextVerified.com API for a specific user',
  args: {
    userId: option({
      type: number,
      long: 'user-id',
      short: 'u',
      description: 'User ID to wait for OTP',
    }),
    timeout: option({
      type: number,
      long: 'timeout',
      short: 't',
      description: 'Timeout in seconds',
      defaultValue: () => 50,
    }),
  },
  handler: async (args) => {
    try {
      logger.info(`Waiting for OTP for user ${args.userId} (timeout: ${args.timeout}s)`);
      
      // Run migrations first
      await runMigrations();
      
      // Initialize TextVerified service
      const textVerifiedService = new TextVerifiedService();
      
      // Get account details first
      await textVerifiedService.getAccountDetails();
      
      // Wait for OTP
      const otp = await textVerifiedService.waitForOTP(args.userId, args.timeout);
      
      if (otp) {
        logger.info(`✅ OTP received: ${otp}`);
        console.log(`OTP: ${otp}`);
      } else {
        logger.warn('❌ No OTP received within timeout period');
        process.exit(1);
      }
      
    } catch (error) {
      logger.error(error, 'Failed to wait for OTP');
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
    logger.info('  stats           - Show application statistics');
    logger.info('  test-proxy      - Test proxy configuration');
    logger.info('  restore-session - Restore session and open location page');
    logger.info('  wait-otp        - Wait for OTP from TextVerified.com API');
    logger.info('  test-textverified - Test TextVerified.com API and list services');
    logger.info('  check-sms        - Check SMS messages with status code');
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
  case 'test-resume':
    await run(testResumeCmd, commandArgs);
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
  case 'restore-session':
    await run(restoreSessionCmd, commandArgs);
    break;
  case 'import-csv':
    await run(importCsvCmd, commandArgs);
    break;
  case 'test-textverified':
    await run(testTextVerifiedCmd, commandArgs);
    break;
  case 'check-sms':
    await run(checkSmsCmd, commandArgs);
    break;
  case 'wait-otp':
    await run(waitOtpCmd, commandArgs);
    break;
  default:
    await run(mainCmd, process.argv.slice(2));
}
