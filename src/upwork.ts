import { getLogger } from './utils/logger.js';
import { runMigrations } from './database/migrate.js';
import { closeDatabase } from './database/connection.js';
import { BrowserManager } from './browser/browserManager.js';
import { UserService } from './services/userService.js';
import { UpworkService } from './services/upworkService.js';

const logger = getLogger(import.meta.url);

interface UpworkOptions {
  userId?: number;
  limit?: number;
  headless?: boolean;
  upload?: boolean;
  noStealth?: boolean;
  restoreSession?: boolean;
  skipOtp?: boolean;
  skipLocation?: boolean;
  step?: string;
  retry?: boolean;
}

export async function runUpwork(options: UpworkOptions = {}) {
  try {
    logger.info('Starting user processing...');
    
    // Run migrations
    await runMigrations();
    
    // Initialize services
    const browserManager = new BrowserManager({ 
      headless: options.headless || false,
      disableTrackingProtection: options.noStealth // Enable normal browser behavior when no-stealth is used
    });
    const userService = new UserService();
    const upworkService = new UpworkService(browserManager, userService);
    
    // Process users
    if (options.userId && options.userId > 0) {
      logger.info(`Single user mode enabled: will process only user ID ${options.userId}`);
    }

    if (options.step) {
      logger.info(`Force-step mode enabled: will start from "${options.step}" step`);
    }

    if (options.retry) {
      logger.info('Retry mode enabled: will retry captcha-flagged users after processing all other users');
    }

    if (options.upload) {
      logger.info('Upload mode enabled: will stop after Step 4 (Resume Import)');
      if (options.noStealth) {
        logger.info('No-stealth mode enabled: using normal browser behavior for debugging');
      }
      if (options.restoreSession) {
        logger.info('Restore-session mode enabled: will reuse existing sessions');
      }
      if (options.skipOtp) {
        logger.info('Skip-OTP mode enabled: will skip location step except profile picture and redirect to submit page');
      }
      await upworkService.processPendingUsers(options.userId && options.userId > 0 ? 1 : (options.limit || 5), { 
        uploadOnly: true,
        restoreSession: options.restoreSession || false,
        skipOtp: options.skipOtp || false,
        step: options.step,
        retry: options.retry || false,
        userId: options.userId && options.userId > 0 ? options.userId : undefined
      });
    } else {
      if (options.noStealth) {
        logger.info('No-stealth mode enabled: using normal browser behavior for debugging');
      }
      if (options.restoreSession) {
        logger.info('Restore-session mode enabled: will reuse existing sessions');
      }
      if (options.skipOtp) {
        logger.info('Skip-OTP mode enabled: will skip location step except profile picture and redirect to submit page');
      }
      if (options.skipLocation) {
        logger.info('Skip-Location mode enabled: will skip the location page and mark rate step as completed');
      }
      await upworkService.processPendingUsers(options.userId && options.userId > 0 ? 1 : (options.limit || 5), {
        restoreSession: options.restoreSession || false,
        skipOtp: options.skipOtp || false,
        skipLocation: options.skipLocation || false,
        step: options.step,
        retry: options.retry || false,
        userId: options.userId && options.userId > 0 ? options.userId : undefined
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
    throw error;
  }
}
