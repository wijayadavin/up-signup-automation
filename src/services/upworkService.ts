import { BrowserManager } from '../browser/browserManager.js';
import { UserService } from './userService.js';
import { getLogger } from '../utils/logger.js';
import { LoginAutomation as AutomationLoginAutomation, type LoginResult } from '../automation/LoginAutomation.js';
import { ProxyTestService } from './proxyTestService.js';
import { LoginAutomation as ServicesLoginAutomation, type LoginResult as ServicesLoginResult } from '../services/loginAutomation.js';
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
  private proxyTestService: ProxyTestService;

  constructor(
    browserManager: BrowserManager,
    userService: UserService,
    config: Partial<UpworkConfig> = {}
  ) {
    this.browserManager = browserManager;
    this.userService = userService;
    this.proxyTestService = new ProxyTestService(browserManager);
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

  async visitLoginPage(keepOpen: boolean = false, userId?: number): Promise<boolean> {
    let page: Page | null = null;
    
    try {
      logger.info('Starting login page visit...');
      
      // If userId is provided, create a user-specific browser manager
      if (userId) {
        const user = await this.userService.getUserById(userId);
        if (user) {
          logger.info({ userId, email: user.email }, 'Using user-specific browser manager');
          const userBrowserManager = new BrowserManager({
            headless: this.browserManager.isHeadless(),
            user: user
          });
          page = await userBrowserManager.newPage();
        } else {
          logger.warn({ userId }, 'User not found, using default browser manager');
          page = await this.browserManager.newPage();
        }
      } else {
        page = await this.browserManager.newPage();
      }
      
      // Check and log current IP address before visiting
      const currentIP = await this.browserManager.getCurrentIP(page);
      if (currentIP) {
        logger.info({ 
          currentIP,
          proxyEnabled: this.browserManager.isProxyEnabled(),
          mode: 'visit',
          userId: userId || 'none'
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

  async checkLoginStatus(keepOpen: boolean = false, userId?: number): Promise<boolean> {
    let page: Page | null = null;
    
    try {
      logger.info('Checking login status (debug mode)...');
      
      // If userId is provided, create a user-specific browser manager
      if (userId) {
        const user = await this.userService.getUserById(userId);
        if (user) {
          logger.info({ userId, email: user.email }, 'Using user-specific browser manager for debug');
          const userBrowserManager = new BrowserManager({
            headless: this.browserManager.isHeadless(),
            user: user
          });
          page = await userBrowserManager.newPage();
        } else {
          logger.warn({ userId }, 'User not found, using default browser manager for debug');
          page = await this.browserManager.newPage();
        }
      } else {
        page = await this.browserManager.newPage();
      }
      
      // Check and log current IP address before debug check
      const currentIP = await this.browserManager.getCurrentIP(page);
      if (currentIP) {
        logger.info({ 
          currentIP,
          proxyEnabled: this.browserManager.isProxyEnabled(),
          mode: 'debug',
          userId: userId || 'none'
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

  async processUser(user: User, options?: { uploadOnly?: boolean; restoreSession?: boolean; skipOtp?: boolean; skipLocation?: boolean; step?: string }): Promise<{
    success: boolean;
    errorCode?: string;
    errorMessage?: string;
    loginResult?: LoginResult;
  }> {
    let page: Page | null = null;
    let userBrowserManager: BrowserManager | undefined;
    
    try {
      logger.info({ userId: user.id, email: user.email }, 'Processing user');

      // Update attempt count
      await this.userService.updateUserAttempt(user.id, {
        last_attempt_at: new Date(),
        attempt_count: user.attempt_count + 1,
      });

      // Create user-specific browser manager for proxy port management
      const userBrowserManager = new BrowserManager({
        headless: this.browserManager.isHeadless(),
        user: user // Pass user for proxy port management
      });
      
      // Execute login automation with user-specific browser manager
      page = await userBrowserManager.newPage();
      
      // Clear browser state to ensure we start fresh for each user
      await userBrowserManager.clearBrowserState(page);
      
      // Check and log current IP address before starting automation
      const currentIP = await userBrowserManager.getCurrentIP(page);
      if (currentIP) {
        logger.info({ 
          userId: user.id,
          email: user.email,
          currentIP,
          proxyEnabled: userBrowserManager.isProxyEnabled()
        }, 'Starting automation with current IP');
      }
      
      // Decide which automation implementation to use
      // Use automation wrapper only for specific session/OTP features
      // For upload functionality, use comprehensive services automation
      const useAutomationWrapper = Boolean(options?.restoreSession || options?.skipOtp);
      let loginResult: LoginResult | ServicesLoginResult;

      if (useAutomationWrapper) {
        logger.info({ userId: user.id }, 'Using automation wrapper (session/OTP features)');
        const loginAutomation = new AutomationLoginAutomation(page, user, userBrowserManager);
        loginResult = await loginAutomation.execute(options);
      } else {
        logger.info({ userId: user.id }, 'Using comprehensive services automation (full step handling)');
        const loginAutomation = new ServicesLoginAutomation(page, user);
        loginResult = await loginAutomation.execute({ uploadOnly: options?.uploadOnly });
      }

      // Log the result
      logger.info({ 
        userId: user.id, 
        status: loginResult.status, 
        stage: loginResult.stage,
        error_code: loginResult.error_code,
        url: loginResult.url 
      }, 'Login automation completed');

      // Clean up user-specific browser manager
      try {
        await userBrowserManager.close();
      } catch (closeError) {
        logger.warn('Failed to close user browser manager:', closeError);
      }

      // Handle different result types
      if (loginResult.status === 'success') {
        // Check if this is a rate_completed status (skipLocation mode)
        if (loginResult.stage === 'rate_completed') {
          logger.info({ userId: user.id }, 'Rate step completed (skipLocation mode) - not marking as full success');
          return { 
            success: true,
            loginResult 
          };
        } else {
          // Full profile completion
          await this.userService.updateUserSuccess(user.id, {
            success_at: new Date(),
          });
          logger.info({ userId: user.id }, 'User processed successfully');
          return { 
            success: true,
            loginResult 
          };
        }
      } else if (loginResult.status === 'soft_fail') {
        // Handle special case for suspicious login - flag user for captcha
        if (loginResult.error_code === 'SUSPICIOUS_LOGIN') {
          await this.userService.updateUserCaptchaFlag(user.id, {
            captcha_flagged_at: new Date(),
          });
          logger.info({ userId: user.id }, 'User flagged for captcha due to suspicious login');
        }
        
        // Handle phone verification pending - this is a retryable condition
        if (loginResult.error_code === 'PHONE_VERIFICATION_PENDING') {
          logger.info({ userId: user.id }, 'Phone verification pending, user will be retried later');
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
      
      // Clean up user-specific browser manager if it exists
      if (typeof userBrowserManager !== 'undefined') {
        try {
          await userBrowserManager.close();
        } catch (closeError) {
          logger.warn('Failed to close user browser manager in finally block:', closeError);
        }
      }
    }
  }

  async processPendingUsers(limit: number = 5, options?: { uploadOnly?: boolean; restoreSession?: boolean; skipOtp?: boolean; skipLocation?: boolean; step?: string; retry?: boolean }): Promise<void> {
    try {
      // First, process normal pending users (excluding captcha-flagged)
      const normalUsers = await this.userService.getPendingUsers(limit);
      
      if (normalUsers.length > 0) {
        logger.info({ count: normalUsers.length }, 'Processing normal pending users (excluding captcha-flagged)');

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

        for (const user of normalUsers) {
          const result = await this.processUser(user, options);
          
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

        logger.info('Finished processing normal pending users');
      } else {
        logger.info('No normal pending users to process');
      }

      // If retry mode is enabled, process failed users after normal users
      if (options?.retry) {
        logger.info('🔄 Retry mode enabled - will keep trying until all users succeed');
        
        let retryRound = 1;
        let totalProcessed = 0;
        let totalSuccessful = 0;
        
        while (true) {
          // Get both captcha-flagged users and other failed users
          const captchaUsers = await this.userService.getCaptchaFlaggedUsers(limit);
          const failedUsers = await this.userService.getFailedUsers(limit);
          
          const totalRetryUsers = captchaUsers.length + failedUsers.length;
          
          if (totalRetryUsers === 0) {
            logger.info({ 
              retryRound, 
              totalProcessed, 
              totalSuccessful 
            }, '🎉 All users have been processed successfully! Retry complete.');
            break;
          }
          
          logger.info({ 
            retryRound,
            captchaCount: captchaUsers.length, 
            failedCount: failedUsers.length,
            totalCount: totalRetryUsers,
            totalProcessed,
            totalSuccessful
          }, `🔄 Retry round ${retryRound} - Processing ${totalRetryUsers} failed users`);
          
          // Test proxy connection before processing retry users
          logger.info('Testing proxy connection before retry processing...');
          const proxyTestResult = await this.proxyTestService.testProxyWithRetry(3, 10000);
          
          if (!proxyTestResult.success) {
            logger.error({ error: proxyTestResult.error }, 'Proxy test failed, skipping retry processing');
            logger.info('Failed users will be retried in next run when proxy is working');
            return;
          }
          
          logger.info({ ip: proxyTestResult.ip }, '✅ Proxy test successful, proceeding with retry processing');
          
          // Clear browser state before processing retry users
          let tempPage: Page | null = null;
          try {
            tempPage = await this.browserManager.newPage();
            await this.browserManager.clearBrowserState(tempPage);
            logger.info('Browser state cleared for retry processing');
          } catch (error) {
            logger.warn(error, 'Failed to clear browser state for retry, continuing...');
          } finally {
            if (tempPage) {
              try {
                await tempPage.close();
              } catch (error) {
                // Page might already be closed
              }
            }
          }

          let roundSuccessful = 0;
          let roundProcessed = 0;

          // Process captcha-flagged users first
          for (const user of captchaUsers) {
            roundProcessed++;
            // Assign a new proxy port to avoid conflicts
            const newProxyPort = await this.getNextAvailableProxyPort(user.last_proxy_port);
            await this.userService.updateUserLastProxyPort(user.id, newProxyPort);
            
            logger.info({ userId: user.id, email: user.email, newProxyPort }, 'Assigned new proxy port for captcha retry');

            const result = await this.processUser(user, options);
            
            if (!result.success) {
              // Update user with error information
              await this.userService.updateUserAttempt(user.id, {
                last_attempt_at: new Date(),
                attempt_count: user.attempt_count + 1,
                last_error_code: result.errorCode,
                last_error_message: result.errorMessage,
              });
            } else {
              // Clear captcha flag on success
              await this.userService.clearUserCaptchaFlag(user.id);
              roundSuccessful++;
              logger.info({ userId: user.id, email: user.email }, 'Cleared captcha flag after successful retry');
            }

            // Add delay between users to avoid rate limiting
            await this.delay(3000); // Longer delay for retries
          }

          // Process other failed users
          for (const user of failedUsers) {
            roundProcessed++;
            // Assign a new proxy port to avoid conflicts
            const newProxyPort = await this.getNextAvailableProxyPort(user.last_proxy_port);
            await this.userService.updateUserLastProxyPort(user.id, newProxyPort);
            
            logger.info({ userId: user.id, email: user.email, newProxyPort, lastError: user.last_error_code }, 'Assigned new proxy port for failed user retry');

            const result = await this.processUser(user, options);
            
            if (!result.success) {
              // Update user with error information
              await this.userService.updateUserAttempt(user.id, {
                last_attempt_at: new Date(),
                attempt_count: user.attempt_count + 1,
                last_error_code: result.errorCode,
                last_error_message: result.errorMessage,
              });
            } else {
              roundSuccessful++;
              logger.info({ userId: user.id, email: user.email }, 'Successfully retried failed user');
            }

            // Add delay between users to avoid rate limiting
            await this.delay(3000); // Longer delay for retries
          }

          totalProcessed += roundProcessed;
          totalSuccessful += roundSuccessful;

          logger.info({ 
            retryRound,
            roundProcessed,
            roundSuccessful,
            totalProcessed,
            totalSuccessful
          }, `📊 Retry round ${retryRound} complete - ${roundSuccessful}/${roundProcessed} users succeeded`);

          retryRound++;
        }
      }

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

  private async getNextAvailableProxyPort(currentPort: number | null): Promise<number> {
    // Start from port 10001 if no current port, otherwise increment by 1
    const basePort = 10001;
    const nextPort = currentPort ? currentPort + 1 : basePort;
    
    // Ensure we don't exceed reasonable port range (up to 10100)
    const maxPort = 10100;
    return Math.min(nextPort, maxPort);
  }
}
