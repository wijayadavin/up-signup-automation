import { BrowserManager } from '../browser/browserManager.js';
import { UserService } from './userService.js';
import { getLogger } from '../utils/logger.js';
import type { User } from '../types/database.js';
import type { Page } from 'puppeteer';

const logger = getLogger(import.meta.url);

export interface UpworkConfig {
  loginUrl: string;
  maxRetries: number;
  retryDelay: number;
}

export class UpworkService {
  private browserManager: BrowserManager;
  private userService: UserService;
  private config: UpworkConfig;

  constructor(
    browserManager: BrowserManager,
    userService: UserService,
    config: Partial<UpworkConfig> = {}
  ) {
    this.browserManager = browserManager;
    this.userService = userService;
    this.config = {
      loginUrl: config.loginUrl ?? 'https://www.upwork.com/ab/account-security/login',
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 5000,
    };
  }

  async visitLoginPage(): Promise<boolean> {
    let page: Page | null = null;
    
    try {
      logger.info('Starting login page visit...');
      
      page = await this.browserManager.newPage();
      
      // Navigate to login page
      logger.info(`Navigating to: ${this.config.loginUrl}`);
      await page.goto(this.config.loginUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Wait for page to load completely
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check if we're on the login page
      const currentUrl = page.url();
      logger.info(`Current URL: ${currentUrl}`);

      // Take a screenshot for debugging
      await page.screenshot({ 
        path: `./screenshots/login-page-${Date.now()}.png`,
        fullPage: true 
      });

      // Check for common login page elements
      const loginForm = await page.$('form[action*="login"], input[name="login[username]"], input[name="login[password]"]');
      
      if (loginForm) {
        logger.info('Successfully reached Upwork login page');
        return true;
      } else {
        logger.warn('Login form not found on page');
        return false;
      }

    } catch (error) {
      logger.error(error, 'Failed to visit login page');
      return false;
    } finally {
      if (page) {
        try {
          await page.close();
        } catch (error) {
          // Page might already be closed
        }
      }
    }
  }

  async processUser(user: User): Promise<{
    success: boolean;
    errorCode?: string;
    errorMessage?: string;
  }> {
    try {
      logger.info({ userId: user.id, email: user.email }, 'Processing user');

      // Update attempt count
      await this.userService.updateUserAttempt(user.id, {
        last_attempt_at: new Date(),
        attempt_count: user.attempt_count + 1,
      });

      // Visit login page first
      const loginPageSuccess = await this.visitLoginPage();
      
      if (!loginPageSuccess) {
        return {
          success: false,
          errorCode: 'LOGIN_PAGE_FAILED',
          errorMessage: 'Failed to reach login page',
        };
      }

      // TODO: Implement actual sign-up automation
      // For now, just mark as successful for testing
      await this.userService.updateUserSuccess(user.id, {
        success_at: new Date(),
      });

      logger.info({ userId: user.id }, 'User processed successfully');
      return { success: true };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error, userId: user.id }, 'Failed to process user');

      return {
        success: false,
        errorCode: 'PROCESSING_ERROR',
        errorMessage,
      };
    }
  }

  async processPendingUsers(limit: number = 5): Promise<void> {
    try {
      const users = await this.userService.getPendingUsers(limit);
      
      if (users.length === 0) {
        logger.info('No pending users to process');
        return;
      }

      logger.info({ count: users.length }, 'Processing pending users');

      for (const user of users) {
        const result = await this.processUser(user);
        
        if (!result.success) {
          // Update user with error information
          await this.userService.updateUserAttempt(user.id, {
            last_attempt_at: new Date(),
            attempt_count: user.attempt_count + 1,
            last_error_code: result.errorCode,
            last_error_message: result.errorMessage,
          });
        }

        // Add delay between users to avoid rate limiting
        await this.delay(2000);
      }

      logger.info('Finished processing pending users');

    } catch (error) {
      logger.error(error, 'Failed to process pending users');
      throw error;
    }
  }

  async getStats(): Promise<{
    browserConnected: boolean;
    userStats: {
      total: number;
      successful: number;
      pending: number;
      failed: number;
    };
  }> {
    const browserConnected = await this.browserManager.isConnected();
    const userStats = await this.userService.getStats();

    return {
      browserConnected,
      userStats,
    };
  }

  async close(): Promise<void> {
    await this.browserManager.close();
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
