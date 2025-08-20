import { BrowserManager } from '../browser/browserManager.js';
import { UserService } from './userService.js';
import { RequestService } from './requestService.js';
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
  private requestService: RequestService;
  private config: UpworkConfig;
  private proxyTestService: ProxyTestService;

  constructor(
    browserManager: BrowserManager,
    userService: UserService,
    config: Partial<UpworkConfig> = {}
  ) {
    this.browserManager = browserManager;
    this.userService = userService;
    this.requestService = new RequestService();
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
      logger.info({ userId: user.id, email: user.email, country: user.country_code }, 'Processing user');

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
          country: user.country_code,
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
        logger.info({ userId: user.id, country: user.country_code }, 'Using automation wrapper (session/OTP features)');
        const loginAutomation = new AutomationLoginAutomation(page, user, userBrowserManager);
        loginResult = await loginAutomation.execute(options);
      } else {
        logger.info({ userId: user.id, country: user.country_code }, 'Using comprehensive services automation (full step handling)');
        const loginAutomation = new ServicesLoginAutomation(page, user);
        loginResult = await loginAutomation.execute({ uploadOnly: options?.uploadOnly });
      }

      // Log the result
      logger.info({ 
        userId: user.id, 
        country: user.country_code,
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
          logger.info({ userId: user.id, country: user.country_code }, 'Rate step completed (skipLocation mode) - not marking as full success');
          return { 
            success: true,
            loginResult 
          };
        } else {
          // Full profile completion
          await this.userService.updateUserSuccess(user.id, {
            success_at: new Date(),
          });
          logger.info({ userId: user.id, country: user.country_code }, 'User processed successfully');
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
          logger.info({ userId: user.id, country: user.country_code }, 'User flagged for captcha due to suspicious login');
        }
        
        // Handle phone verification pending - this is a retryable condition
        if (loginResult.error_code === 'PHONE_VERIFICATION_PENDING') {
          logger.info({ userId: user.id, country: user.country_code }, 'Phone verification pending, user will be retried later');
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
          logger.info({ userId: user.id, country: user.country_code }, 'User flagged for captcha due to network restriction/captcha');
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

  async processPendingUsers(limit: number = 5, options?: { uploadOnly?: boolean; restoreSession?: boolean; skipOtp?: boolean; skipLocation?: boolean; step?: string; retry?: boolean; userId?: number }): Promise<void> {
    const activeRequests: any[] = [];
    let isShuttingDown = false;
    
    // Set up graceful shutdown handler
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);
      isShuttingDown = true;
      
      // Mark all active requests as canceled
      for (const request of activeRequests) {
        try {
          await this.requestService.updateRequest(request.id, {
            status: 'CANCELED',
            completed_at: new Date(),
            error_message: `Process terminated by ${signal}`
          });
          logger.info(`Marked request ${request.id} for user ${request.user_id} as CANCELED`);
        } catch (error) {
          logger.error(`Failed to mark request ${request.id} as canceled:`, error);
        }
      }
      
      logger.info(`Graceful shutdown completed. ${activeRequests.length} requests marked as canceled.`);
      process.exit(0);
    };
    
    // Register signal handlers
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    
    try {

      // First, process normal pending users (excluding captcha-flagged)
      let normalUsers: User[];
      
      if (options?.userId) {
        // Process specific user by ID
        const specificUser = await this.userService.getUserById(options.userId);
        if (specificUser) {
          normalUsers = [specificUser];
          logger.info({ userId: options.userId }, 'Processing specific user by ID');
        } else {
          logger.error({ userId: options.userId }, 'User not found');
          return;
        }
      } else {
        // Process pending users normally
        normalUsers = await this.userService.getPendingUsers(limit);
      }
      
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

        // Sort users by ID in descending order (higher IDs first)
        const sortedNormalUsers = normalUsers.sort((a, b) => b.id - a.id);
        logger.info({ 
          userIds: sortedNormalUsers.map(u => u.id),
          count: sortedNormalUsers.length 
        }, 'Processing users in descending ID order (highest first)');
        
        for (const user of sortedNormalUsers) {
          // Check if we're shutting down
          if (isShuttingDown) {
            logger.info('Shutdown detected, stopping user processing');
            break;
          }
          
          // Create a request for this user
          const request = await this.requestService.createRequest({
            user_id: user.id,
            status: 'RUNNING',
            attempt_count: user.attempt_count + 1,
            options: options || {}
          });
          
          // Add to active requests for graceful shutdown
          activeRequests.push(request);
          
          try {
            const result = await this.processUser(user, options);
            
            if (!result.success) {
              // Update request with error information
              await this.requestService.updateRequest(request.id, {
                status: 'WAITING_FOR_RETRY',
                completed_at: new Date(),
                error_code: result.errorCode,
                error_message: result.errorMessage
              });
              
              // Update user with error information
              await this.userService.updateUserAttempt(user.id, {
                last_attempt_at: new Date(),
                attempt_count: user.attempt_count + 1,
                last_error_code: result.errorCode,
                last_error_message: result.errorMessage,
              });
            } else {
              // Update request as successful
              await this.requestService.updateRequest(request.id, {
                status: 'SUCCESS',
                completed_at: new Date()
              });
            }
          } catch (error) {
            // Update request with error
            await this.requestService.updateRequest(request.id, {
              status: 'FAILED',
              completed_at: new Date(),
              error_message: error instanceof Error ? error.message : 'Unknown error'
            });
            
            logger.error(`Error processing user ${user.id}:`, error);
          } finally {
            // Remove from active requests
            const index = activeRequests.findIndex(r => r.id === request.id);
            if (index > -1) {
              activeRequests.splice(index, 1);
            }
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
        logger.info('🔄 Retry mode enabled - will process users that need retry (attempts < 5)');
        
        // Get users that need retry (failed users with less than 5 attempts)
        // Only retry users from the current batch, not all users in database
        const allRetryableUsers = await this.userService.getUsersForRetry(limit);
        
        // Filter to only include users that were part of the initial batch
        const retryableUsers = allRetryableUsers.filter(user => 
          normalUsers.some(normalUser => normalUser.id === user.id)
        );
        
        logger.info(`📋 Found ${allRetryableUsers.length} total retryable users, but only retrying ${retryableUsers.length} from current batch`);
        
        if (retryableUsers.length === 0) {
          logger.info('✅ No users need retry (all users either succeeded or exceeded max attempts)');
        } else {
          logger.info(`📋 Found ${retryableUsers.length} users that need retry (attempts < 5)`);
          
          // Test proxy connection before processing retry users
          logger.info('Testing proxy connection before retry processing...');
          const proxyTestResult = await this.proxyTestService.testProxyWithRetry(3, 15000);
          
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

          let retrySuccessful = 0;
          let retryFailed = 0;

          // Process retryable users (sorted by attempts descending, then by oldest attempt)
          const sortedRetryUsers = retryableUsers.sort((a, b) => {
            if (b.attempt_count !== a.attempt_count) {
              return b.attempt_count - a.attempt_count; // Most attempts first
            }
            return (a.last_attempt_at?.getTime() || 0) - (b.last_attempt_at?.getTime() || 0); // Oldest first
          });
          
          logger.info({ 
            retryUserIds: sortedRetryUsers.map(u => u.id),
            count: sortedRetryUsers.length 
          }, 'Processing retryable users in priority order');
          
          for (const user of sortedRetryUsers) {
            // Check if we're shutting down
            if (isShuttingDown) {
              logger.info('Shutdown detected, stopping retry processing');
              break;
            }
            
            // Create a request for this retry
            const request = await this.requestService.createRequest({
              user_id: user.id,
              status: 'RUNNING',
              attempt_count: user.attempt_count + 1,
              options: { ...options, retry: true }
            });
            
            // Add to active requests for graceful shutdown
            activeRequests.push(request);
            
            try {
              // Assign a new proxy port to avoid conflicts
              const newProxyPort = await this.getNextAvailableProxyPort(user.last_proxy_port);
              await this.userService.updateUserLastProxyPort(user.id, newProxyPort);
              
              logger.info({ 
                userId: user.id, 
                email: user.email, 
                newProxyPort, 
                attempts: user.attempt_count,
                lastError: user.last_error_code 
              }, 'Processing retryable user');

              const result = await this.processUser(user, options);
              
              if (!result.success) {
                retryFailed++;
                logger.error({ userId: user.id, email: user.email, error: result.errorMessage }, 'Retry failed for user');
                
                // Update request with error information
                await this.requestService.updateRequest(request.id, {
                  status: 'WAITING_FOR_RETRY',
                  completed_at: new Date(),
                  error_code: result.errorCode,
                  error_message: result.errorMessage
                });
              } else {
                retrySuccessful++;
                logger.info({ userId: user.id, email: user.email }, 'Retry successful for user');
                
                // Update request as successful
                await this.requestService.updateRequest(request.id, {
                  status: 'SUCCESS',
                  completed_at: new Date()
                });
              }
            } catch (error) {
              retryFailed++;
              logger.error({ userId: user.id, email: user.email, error }, 'Error during retry for user');
              
              // Update request with error
              await this.requestService.updateRequest(request.id, {
                status: 'FAILED',
                completed_at: new Date(),
                error_message: error instanceof Error ? error.message : 'Unknown error'
              });
            } finally {
              // Remove from active requests
              const index = activeRequests.findIndex(r => r.id === request.id);
              if (index > -1) {
                activeRequests.splice(index, 1);
              }
            }

            // Add delay between users to avoid rate limiting
            await this.delay(3000); // Longer delay for retries
          }

          logger.info({ 
            retrySuccessful,
            retryFailed,
            totalRetryUsers: retryableUsers.length
          }, `📊 Retry processing complete - ${retrySuccessful}/${retryableUsers.length} users succeeded`);
        }
      }

      // Update process run with final status
      let totalProcessed = normalUsers.length;
      let totalSuccessful = 0;
      let totalFailed = 0;

      // Count normal users results
      for (const user of normalUsers) {
        const updatedUser = await this.userService.getUserById(user.id);
        if (updatedUser?.success_at) {
          totalSuccessful++;
        } else {
          totalFailed++;
        }
      }

      // Add retry results if retry mode was enabled
      if (options?.retry) {
        const retryableUsers = await this.userService.getUsersForRetry(limit);
        totalProcessed += retryableUsers.length;
        
        // Count retry results
        for (const user of retryableUsers) {
          const updatedUser = await this.userService.getUserById(user.id);
          if (updatedUser?.success_at) {
            totalSuccessful++;
          } else {
            totalFailed++;
          }
        }
      }

      logger.info(`✅ Process pending users completed successfully`);

    } catch (error) {
      logger.error(error, 'Failed to process pending users');
      
      // Mark any remaining active requests as failed
      for (const request of activeRequests) {
        try {
          await this.requestService.updateRequest(request.id, {
            status: 'FAILED',
            completed_at: new Date(),
            error_message: error instanceof Error ? error.message : 'Unknown error'
          });
        } catch (updateError) {
          logger.error(`Failed to mark request ${request.id} as failed:`, updateError);
        }
      }
      
      throw error;
    } finally {
      // Final cleanup: Mark any hanging requests as properly finalized
      try {
        await this.finalizeAllHangingRequests();
      } catch (cleanupError) {
        logger.error('Failed to finalize hanging requests:', cleanupError);
      }
      
      // Clean up signal handlers
      process.removeAllListeners('SIGINT');
      process.removeAllListeners('SIGTERM');
    }
  }

  /**
   * Finalize all hanging requests (RUNNING, WAITING_FOR_RETRY) to clean final status
   */
  private async finalizeAllHangingRequests(): Promise<void> {
    logger.info('🧹 Finalizing all hanging requests...');
    
    try {
      // Get all hanging requests (RUNNING or WAITING_FOR_RETRY)
      const hangingRequests = await this.requestService.getHangingRequests();
      
      if (hangingRequests.length === 0) {
        logger.info('✅ No hanging requests found');
        return;
      }
      
      logger.info(`🧹 Found ${hangingRequests.length} hanging requests to finalize`);
      
      for (const request of hangingRequests) {
        try {
          // Check the user's current status to determine final request status
          const user = await this.userService.getUserById(request.user_id);
          
          if (!user) {
            // User not found, mark request as failed
            await this.requestService.updateRequest(request.id, {
              status: 'FAILED',
              completed_at: new Date(),
              error_message: 'User not found during cleanup'
            });
            continue;
          }
          
          let finalStatus: string;
          let errorMessage: string | undefined;
          
          if (user.success_at) {
            // User was successful
            finalStatus = 'SUCCESS';
          } else if (user.attempt_count >= 5) {
            // User exceeded max retries
            finalStatus = 'FAILED_AFTER_MAX_RETRIES';
            errorMessage = 'Exceeded maximum retry attempts (5)';
          } else {
            // User still has retries left, but command is finishing
            finalStatus = 'CANCELED';
            errorMessage = 'Command completed before retry could be attempted';
          }
          
          await this.requestService.updateRequest(request.id, {
            status: finalStatus,
            completed_at: new Date(),
            error_message: errorMessage
          });
          
          logger.debug(`Finalized request ${request.id} for user ${request.user_id} as ${finalStatus}`);
          
        } catch (error) {
          logger.error(`Failed to finalize request ${request.id}:`, error);
        }
      }
      
      logger.info(`✅ Finalized ${hangingRequests.length} hanging requests`);
      
    } catch (error) {
      logger.error('Failed to get hanging requests for cleanup:', error);
    }
  }

  /**
   * Process a single user (for retry operations)
   */
  async processSingleUser(user: User): Promise<{ success: boolean; error?: string }> {
    try {
      logger.info({ userId: user.id, email: user.email, country: user.country_code }, 'Processing single user for retry');

      // Test proxy connection first
      const proxyTestResult = await this.proxyTestService.testProxyWithRetry(3, 15000);
      if (!proxyTestResult.success) {
        logger.error({ userId: user.id }, `Proxy test failed: ${proxyTestResult.error}`);
        return { success: false, error: `Proxy test failed: ${proxyTestResult.error}` };
      }

      // Process the user
      const result = await this.processUser(user);
      
      if (result.success) {
        logger.info({ userId: user.id, email: user.email }, 'Single user processing successful');
        return { success: true };
      } else {
        logger.error({ userId: user.id, email: user.email, errorCode: result.errorCode }, 'Single user processing failed');
        return { success: false, error: result.errorMessage };
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ userId: user.id, error: errorMessage }, 'Error processing single user');
      return { success: false, error: errorMessage };
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
