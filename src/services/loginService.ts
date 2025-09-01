import { getLogger } from '../utils/logger.js';
import { BrowserManager } from '../browser/browserManager.js';
import { UserService } from './userService.js';
import { LoginAutomation as AutomationLoginAutomation, type LoginResult } from '../automation/LoginAutomation.js';
import { LoginAutomation as ServicesLoginAutomation, type LoginResult as ServicesLoginResult } from './loginAutomation.js';
import type { User } from '../types/database.js';

const logger = getLogger(import.meta.url);

export interface LoginOptions {
  restoreSession?: boolean;
  skipOtp?: boolean;
  skipLocation?: boolean;
  step?: string;
  uploadOnly?: boolean;
}

export interface LoginServiceResult {
  success: boolean;
  loginResult?: LoginResult | ServicesLoginResult;
  errorCode?: string;
  errorMessage?: string;
  page?: any; // Puppeteer page object
  browserManager?: BrowserManager;
}

export class LoginService {
  constructor(private userService: UserService) {}

  async performLogin(
    user: User, 
    options: LoginOptions = {},
    existingBrowserManager?: BrowserManager
  ): Promise<LoginServiceResult> {
    let userBrowserManager: BrowserManager | undefined;
    let page: any;
    
    try {
      logger.info({ userId: user.id, email: user.email, country: user.country_code }, 'Starting login process');

      // Validate and ensure user has a unique proxy port
      const proxyPortValidation = await this.validateAndAssignProxyPort(user);
      if (!proxyPortValidation.success) {
        logger.error({ userId: user.id, error: proxyPortValidation.error }, 'Proxy port validation failed');
        return {
          success: false,
          errorCode: 'PROXY_PORT_VALIDATION_FAILED',
          errorMessage: proxyPortValidation.error
        };
      }

      // Update attempt count
      await this.userService.updateUserAttempt(user.id, {
        last_attempt_at: new Date(),
        attempt_count: user.attempt_count + 1,
      });

      // Use existing browser manager or create new one
      if (existingBrowserManager) {
        userBrowserManager = existingBrowserManager;
        page = await userBrowserManager.newPage();
      } else {
        // Create user-specific browser manager for proxy port management
        userBrowserManager = new BrowserManager({
          headless: false, // Default to non-headless for debugging
          user: user // Pass user for proxy port management
        });
        
        page = await userBrowserManager.newPage();
      }
      
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

      // Handle different result types
      if (loginResult.status === 'success') {
        // Check if this is a rate_completed status (skipLocation mode)
        if (loginResult.stage === 'rate_completed') {
          logger.info({ userId: user.id, country: user.country_code }, 'Rate step completed (skipLocation mode) - not marking as full success');
          return { 
            success: true,
            loginResult,
            page,
            browserManager: userBrowserManager
          };
        } else {
          // Full profile completion
          await this.userService.updateUserSuccess(user.id, {
            success_at: new Date(),
          });
          logger.info({ userId: user.id, country: user.country_code }, 'User processed successfully');
          return { 
            success: true,
            loginResult,
            page,
            browserManager: userBrowserManager
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
      logger.error({ error, userId: user.id }, 'Failed to perform login');

      return {
        success: false,
        errorCode: 'PROCESSING_ERROR',
        errorMessage,
      };
    }
  }

  /**
   * Validate and assign a unique proxy port to a user
   */
  private async validateAndAssignProxyPort(user: User): Promise<{ success: boolean; error?: string }> {
    try {
      // Check if user already has a proxy port
      if (user.last_proxy_port !== null) {
        // Validate that the port is unique
        const isPortUnique = await this.userService.isProxyPortUnique(user.last_proxy_port, user.id);
        if (!isPortUnique) {
          logger.warn({ userId: user.id, port: user.last_proxy_port }, 'User has duplicate proxy port, will reassign');
          // Continue to reassign below
        } else {
          logger.info({ userId: user.id, port: user.last_proxy_port }, 'User has valid unique proxy port');
          return { success: true };
        }
      }

      // Assign a new unique proxy port
      const newProxyPort = await this.assignUniqueProxyPort(user.id);
      if (!newProxyPort) {
        return { 
          success: false, 
          error: 'Failed to assign unique proxy port - no available ports in range' 
        };
      }

      // Update user with new proxy port
      await this.userService.updateUserLastProxyPort(user.id, newProxyPort);
      
      // Update the user object to reflect the change
      user.last_proxy_port = newProxyPort;
      
      logger.info({ userId: user.id, newPort: newProxyPort }, 'Assigned unique proxy port to user');
      return { success: true };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ userId: user.id, error: errorMessage }, 'Failed to validate/assign proxy port');
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Assign a unique proxy port to a user
   */
  private async assignUniqueProxyPort(userId: number): Promise<number | null> {
    const basePort = 10001;
    const maxPort = 10100;
    
    // Try to find an available port
    for (let port = basePort; port <= maxPort; port++) {
      const isAvailable = await this.userService.isProxyPortUnique(port, userId);
      if (isAvailable) {
        return port;
      }
    }
    
    // No available ports found
    return null;
  }
}
