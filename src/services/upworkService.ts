import { BrowserManager } from '../browser/browserManager.js';
import { UserService } from './userService.js';
import { getLogger } from '../utils/logger.js';
import { LoginAutomation, type LoginResult } from './loginAutomation.js';
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

    // Log proxy configuration if enabled
    if (this.browserManager.isProxyEnabled()) {
      const proxyInfo = this.browserManager.getProxyInfo();
      const proxyHost = proxyInfo?.country 
        ? `${proxyInfo.country}.decodo.com`
        : proxyInfo?.host;
      
      logger.info({ 
        proxyHost,
        proxyPort: proxyInfo?.port,
        proxyCountry: proxyInfo?.country,
        proxyZipCode: proxyInfo?.zipCode,
        proxyRotateMinutes: proxyInfo?.rotateMinutes,
        proxyUsername: proxyInfo?.username
      }, 'Decodo proxy enabled for Upwork service');
    } else {
      logger.info('No proxy configured, using direct connection');
    }
  }

  async visitLoginPage(keepOpen: boolean = false): Promise<boolean> {
    let page: Page | null = null;
    
    try {
      logger.info('Starting login page visit...');
      
      page = await this.browserManager.newPage();
      
      // Check and log current IP address before visiting
      const currentIP = await this.browserManager.getCurrentIP(page);
      if (currentIP) {
        logger.info({ 
          currentIP,
          proxyEnabled: this.browserManager.isProxyEnabled(),
          mode: 'visit'
        }, 'Visit mode - navigating with current IP');
      }
      
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

      // Take a screenshot for debugging (optional)
      try {
        await page.screenshot({ 
          path: `./screenshots/login-page-${Date.now()}.png`,
          fullPage: true 
        });
      } catch (screenshotError) {
        logger.warn('Failed to take screenshot, continuing...');
      }

      // Check for common login page elements
      try {
        const loginForm = await page.$('form[action*="login"], input[name="login[username]"], input[name="login[password]"]');
        
        if (loginForm) {
          logger.info('Successfully reached Upwork login page');
          return true;
        } else {
          logger.warn('Login form not found on page');
          return false;
        }
      } catch (pageError) {
        logger.warn('Failed to check login form, assuming page is valid');
        return true;
      }

    } catch (error) {
      logger.error(error, 'Failed to visit login page');
      return false;
    } finally {
      // Only close the page if not keeping it open
      if (page && !keepOpen) {
        try {
          logger.info('Closing page (keepOpen=false)');
          await page.close();
        } catch (error) {
          // Page might already be closed
        }
      } else if (page && keepOpen) {
        logger.info('Keeping page open (keepOpen=true)');
      }
    }
  }

  async checkLoginStatus(keepOpen: boolean = false): Promise<boolean> {
    let page: Page | null = null;
    
    try {
      logger.info('Checking login status (debug mode)...');
      
      page = await this.browserManager.newPage();
      
      // Check and log current IP address before debug check
      const currentIP = await this.browserManager.getCurrentIP(page);
      if (currentIP) {
        logger.info({ 
          currentIP,
          proxyEnabled: this.browserManager.isProxyEnabled(),
          mode: 'debug'
        }, 'Debug mode - checking with current IP');
      }
      
      // Navigate to login page
      logger.info(`Navigating to: ${this.config.loginUrl}`);
      await page.goto(this.config.loginUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Wait for page to load completely
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check current URL to see if we were redirected
      const currentUrl = page.url();
      logger.info(`Current URL after navigation: ${currentUrl}`);

      // Check if we were redirected to create profile page (already logged in)
      if (currentUrl.includes('/nx/create-profile/')) {
        logger.info('✅ Already logged in! Redirected to create profile page');
        
        // Take a screenshot for debugging
        try {
          await page.screenshot({ 
            path: `./screenshots/debug-already-logged-in-${Date.now()}.png`,
            fullPage: true 
          });
          logger.info('Screenshot saved: debug-already-logged-in');
        } catch (screenshotError) {
          logger.warn('Failed to take screenshot, continuing...');
        }

        return true;
      } else if (currentUrl.includes('/ab/account-security/login')) {
        logger.info('❌ Not logged in - still on login page');
        
        // Take a screenshot for debugging
        try {
          await page.screenshot({ 
            path: `./screenshots/debug-not-logged-in-${Date.now()}.png`,
            fullPage: true 
          });
          logger.info('Screenshot saved: debug-not-logged-in');
        } catch (screenshotError) {
          logger.warn('Failed to take screenshot, continuing...');
        }

        // Report status only - visit-login should not perform automation
        logger.info('📋 Login Status: Not logged in');
        logger.info('💡 To perform login automation, use: npm start process-users');
        
        return false;
      } else {
        logger.info(`⚠️ Unknown page: ${currentUrl}`);
        
        // Take a screenshot for debugging
        try {
          await page.screenshot({ 
            path: `./screenshots/debug-unknown-page-${Date.now()}.png`,
            fullPage: true 
          });
          logger.info('Screenshot saved: debug-unknown-page');
        } catch (screenshotError) {
          logger.warn('Failed to take screenshot, continuing...');
        }

        return false;
      }

    } catch (error) {
      logger.error(error, 'Failed to check login status');
      return false;
    } finally {
      // Only close the page if not keeping it open
      if (page && !keepOpen) {
        try {
          logger.info('Closing page (keepOpen=false)');
          await page.close();
        } catch (error) {
          // Page might already be closed
        }
      } else if (page && keepOpen) {
        logger.info('Keeping page open (keepOpen=true)');
      }
    }
  }

  async processUser(user: User): Promise<{
    success: boolean;
    errorCode?: string;
    errorMessage?: string;
    loginResult?: LoginResult;
  }> {
    let page: Page | null = null;
    
    try {
      logger.info({ userId: user.id, email: user.email }, 'Processing user');

      // Update attempt count
      await this.userService.updateUserAttempt(user.id, {
        last_attempt_at: new Date(),
        attempt_count: user.attempt_count + 1,
      });

      // Execute login automation
      page = await this.browserManager.newPage();
      
      // Clear browser state to ensure we start fresh for each user
      await this.browserManager.clearBrowserState(page);
      
      // Check and log current IP address before starting automation
      const currentIP = await this.browserManager.getCurrentIP(page);
      if (currentIP) {
        logger.info({ 
          userId: user.id,
          email: user.email,
          currentIP,
          proxyEnabled: this.browserManager.isProxyEnabled()
        }, 'Starting automation with current IP');
      }
      
      const loginAutomation = new LoginAutomation(page, user);
      const loginResult = await loginAutomation.execute();

      // Log the result
      logger.info({ 
        userId: user.id, 
        status: loginResult.status, 
        stage: loginResult.stage,
        error_code: loginResult.error_code,
        url: loginResult.url 
      }, 'Login automation completed');

      // Handle different result types
      if (loginResult.status === 'success') {
        await this.userService.updateUserSuccess(user.id, {
          success_at: new Date(),
        });
        logger.info({ userId: user.id }, 'User processed successfully');
        return { 
          success: true,
          loginResult 
        };
      } else if (loginResult.status === 'soft_fail') {
        // Handle special case for suspicious login - flag user for captcha
        if (loginResult.error_code === 'SUSPICIOUS_LOGIN') {
          await this.userService.updateUserCaptchaFlag(user.id, {
            captcha_flagged_at: new Date(),
          });
          logger.info({ userId: user.id }, 'User flagged for captcha due to suspicious login');
        }
        
        // Soft failures - update with error info but don't mark as permanent failure
        return {
          success: false,
          errorCode: loginResult.error_code,
          errorMessage: loginResult.evidence || 'Soft failure during login',
          loginResult
        };
      } else if (loginResult.status === 'hard_fail') {
        // Handle captcha detection - flag user for captcha
        if (loginResult.error_code === 'CAPTCHA_DETECTED') {
          await this.userService.updateUserCaptchaFlag(user.id, {
            captcha_flagged_at: new Date(),
          });
          logger.info({ userId: user.id }, 'User flagged for captcha due to network restriction/captcha');
        }
        
        // Hard failures - update with error info
        return {
          success: false,
          errorCode: loginResult.error_code,
          errorMessage: loginResult.evidence || 'Hard failure during login',
          loginResult
        };
      } else {
        // Unknown status - fallback
        return {
          success: false,
          errorCode: 'UNKNOWN_STATUS',
          errorMessage: `Unknown login result status: ${loginResult.status}`,
          loginResult
        };
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error, userId: user.id }, 'Failed to process user');

      return {
        success: false,
        errorCode: 'PROCESSING_ERROR',
        errorMessage,
      };
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

  async processPendingUsers(limit: number = 5): Promise<void> {
    try {
      const users = await this.userService.getPendingUsers(limit);
      
      if (users.length === 0) {
        logger.info('No pending users to process');
        return;
      }

      logger.info({ count: users.length }, 'Processing pending users');

      // Create a temporary page to clear browser state at the start
      let tempPage: Page | null = null;
      try {
        tempPage = await this.browserManager.newPage();
        await this.browserManager.clearBrowserState(tempPage);
        logger.info('Initial browser state cleared');
      } catch (error) {
        logger.warn(error, 'Failed to clear initial browser state, continuing...');
      } finally {
        if (tempPage) {
          try {
            await tempPage.close();
          } catch (error) {
            // Page might already be closed
          }
        }
      }

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
