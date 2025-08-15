import { Page } from 'puppeteer';
import { getLogger } from '../utils/logger.js';
import type { User } from '../types/database.js';

const logger = getLogger(import.meta.url);

export interface LoginResult {
  status: 'success' | 'soft_fail' | 'hard_fail';
  stage: 'email' | 'password' | 'create_profile' | 'done';
  error_code?: string;
  screenshots: {
    email_filled?: string;
    password_filled?: string;
    after_login?: string;
    create_profile?: string;
    suspicious_page?: string;
  };
  url: string;
  evidence?: string;
}

export class LoginAutomation {
  private page: Page;
  private user: User;
  private screenshots: LoginResult['screenshots'] = {};

  constructor(page: Page, user: User) {
    this.page = page;
    this.user = user;
  }

  async execute(): Promise<LoginResult> {
    try {
      // Set desktop user agent and viewport
      await this.setupBrowser();
      
      // Step 1: Go to login page
      const loginPageResult = await this.goToLoginPage();
      if (loginPageResult.status !== 'success') {
        return loginPageResult;
      }

      // Step 2: Enter email
      const emailResult = await this.enterEmail();
      if (emailResult.status !== 'success') {
        return emailResult;
      }

      // Step 3: Enter password
      const passwordResult = await this.enterPassword();
      if (passwordResult.status !== 'success') {
        return passwordResult;
      }

      // Step 4: Handle create profile
      const profileResult = await this.handleCreateProfile();
      if (profileResult.status !== 'success') {
        return profileResult;
      }

      return {
        status: 'success',
        stage: 'done',
        screenshots: this.screenshots,
        url: this.page.url(),
      };

    } catch (error) {
      logger.error({ error, userId: this.user.id }, 'Login automation failed');
      return {
        status: 'hard_fail',
        stage: 'email',
        error_code: 'NETWORK',
        screenshots: this.screenshots,
        url: this.page.url(),
        evidence: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async setupBrowser(): Promise<void> {
    // Set desktop user agent
    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Set viewport
    await this.page.setViewport({ width: 1440, height: 1080 });

    // Add random delays for human-like behavior
    await this.randomDelay(1000, 2000);
  }

  private async goToLoginPage(): Promise<LoginResult> {
    try {
      logger.info('Navigating to login page...');
      
      await this.page.goto('https://www.upwork.com/ab/account-security/login', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      // Assert URL contains the expected path
      const currentUrl = this.page.url();
      if (!currentUrl.includes('/ab/account-security/login')) {
        return {
          status: 'soft_fail',
          stage: 'email',
          error_code: 'INVALID_URL',
          screenshots: this.screenshots,
          url: currentUrl,
          evidence: `Expected /ab/account-security/login, got ${currentUrl}`,
        };
      }

      logger.info('Successfully reached login page');
      return {
        status: 'success',
        stage: 'email',
        screenshots: this.screenshots,
        url: currentUrl,
      };

    } catch (error) {
      return {
        status: 'hard_fail',
        stage: 'email',
        error_code: 'NETWORK',
        screenshots: this.screenshots,
        url: this.page.url(),
        evidence: error instanceof Error ? error.message : 'Navigation failed',
      };
    }
  }

  private async enterEmail(): Promise<LoginResult> {
    try {
      logger.info('Entering email...');

      // Wait for email field with retry
      const emailField = await this.waitForSelectorWithRetry([
        '#login_username',
        '[aria-label*="Username"]',
        '[aria-label*="email"]',
        'input[name="login[username]"]',
      ], 15000);

      if (!emailField) {
        return {
          status: 'soft_fail',
          stage: 'email',
          error_code: 'EMAIL_FIELD_NOT_FOUND',
          screenshots: this.screenshots,
          url: this.page.url(),
        };
      }

      // Clear and type email with human-like delays
      await emailField.click();
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('KeyA');
      await this.page.keyboard.up('Control');
      await this.page.keyboard.press('Backspace');
      
      await this.typeHumanLike(this.user.email);
      
      // Take screenshot after email is filled
      this.screenshots.email_filled = await this.takeScreenshot('email_filled');

      // Click Continue button
      const continueButton = await this.waitForSelectorWithRetry([
        '#login_password_continue',
        'button[button-role="continue"][target-form="username"]',
        'button[type="submit"]',
      ], 10000);

      if (!continueButton) {
        return {
          status: 'soft_fail',
          stage: 'email',
          error_code: 'CONTINUE_BUTTON_NOT_FOUND',
          screenshots: this.screenshots,
          url: this.page.url(),
        };
      }

      await continueButton.click();
      await this.randomDelay(1000, 2000);

      // Wait for either password form or error
      const passwordField = await this.page.waitForSelector('#login_password', {
        timeout: 10000,
        visible: true,
      }).catch(() => null);

      if (!passwordField) {
        // Check for inline error
        const errorElement = await this.page.$('.error-message, .alert-error, [role="alert"]');
        if (errorElement) {
          const errorText = await errorElement.evaluate(el => el.textContent?.trim() || '');
          return {
            status: 'soft_fail',
            stage: 'email',
            error_code: 'INVALID_EMAIL',
            screenshots: this.screenshots,
            url: this.page.url(),
            evidence: errorText,
          };
        }

        return {
          status: 'soft_fail',
          stage: 'email',
          error_code: 'PASSWORD_FIELD_NOT_FOUND',
          screenshots: this.screenshots,
          url: this.page.url(),
        };
      }

      logger.info('Email entered successfully');
      return {
        status: 'success',
        stage: 'password',
        screenshots: this.screenshots,
        url: this.page.url(),
      };

    } catch (error) {
      return {
        status: 'hard_fail',
        stage: 'email',
        error_code: 'EMAIL_ENTRY_FAILED',
        screenshots: this.screenshots,
        url: this.page.url(),
        evidence: error instanceof Error ? error.message : 'Email entry failed',
      };
    }
  }

  private async enterPassword(): Promise<LoginResult> {
    try {
      logger.info('Entering password...');

      // Wait for password field
      const passwordField = await this.waitForSelectorWithRetry([
        '#login_password',
        '[aria-label*="Password"]',
        'input[name="login[password]"]',
      ], 15000);

      if (!passwordField) {
        return {
          status: 'soft_fail',
          stage: 'password',
          error_code: 'PASSWORD_FIELD_NOT_FOUND',
          screenshots: this.screenshots,
          url: this.page.url(),
        };
      }

      // Type password (no logging)
      await passwordField.click();
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('KeyA');
      await this.page.keyboard.up('Control');
      await this.page.keyboard.press('Backspace');
      
      await this.typeHumanLike(this.user.password);
      
      // Take screenshot after password is filled
      this.screenshots.password_filled = await this.takeScreenshot('password_filled');

      // Click Log in button
      const loginButton = await this.waitForSelectorWithRetry([
        '#login_control_continue',
        '[aria-label*="Log in"]',
        'button[type="submit"]',
      ], 10000);

      if (!loginButton) {
        return {
          status: 'soft_fail',
          stage: 'password',
          error_code: 'LOGIN_BUTTON_NOT_FOUND',
          screenshots: this.screenshots,
          url: this.page.url(),
        };
      }

      await loginButton.click();
      await this.randomDelay(2000, 3000);

      // Wait for navigation or MFA/CAPTCHA
      const result = await Promise.race([
        this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).then(() => null),
        this.detectMFAOrCaptcha(),
        this.detectPasswordError(),
      ]);

      if (result) {
        return result;
      }

      // Check if we reached create profile page
      const currentUrl = this.page.url();
      if (currentUrl.includes('/nx/create-profile')) {
        this.screenshots.after_login = await this.takeScreenshot('after_login');
        logger.info('Successfully logged in, reached create profile page');
        return {
          status: 'success',
          stage: 'create_profile',
          screenshots: this.screenshots,
          url: currentUrl,
        };
      }

      return {
        status: 'soft_fail',
        stage: 'password',
        error_code: 'UNEXPECTED_PAGE',
        screenshots: this.screenshots,
        url: currentUrl,
        evidence: `Expected create profile page, got ${currentUrl}`,
      };

    } catch (error) {
      return {
        status: 'hard_fail',
        stage: 'password',
        error_code: 'PASSWORD_ENTRY_FAILED',
        screenshots: this.screenshots,
        url: this.page.url(),
        evidence: error instanceof Error ? error.message : 'Password entry failed',
      };
    }
  }

  private async handleCreateProfile(): Promise<LoginResult> {
    try {
      logger.info('Handling create profile page...');

      const currentUrl = this.page.url();
      if (!currentUrl.includes('/nx/create-profile')) {
        return {
          status: 'soft_fail',
          stage: 'create_profile',
          error_code: 'NOT_ON_CREATE_PROFILE',
          screenshots: this.screenshots,
          url: currentUrl,
        };
      }

      // Take screenshot of create profile page
      this.screenshots.create_profile = await this.takeScreenshot('create_profile');

      // Click Get Started button
      const getStartedButton = await this.waitForSelectorWithRetry([
        'button[data-qa="get-started-btn"]',
        '[aria-label*="Get started"]',
        'button:contains("Get Started")',
      ], 15000);

      if (!getStartedButton) {
        return {
          status: 'soft_fail',
          stage: 'create_profile',
          error_code: 'GET_STARTED_NOT_FOUND',
          screenshots: this.screenshots,
          url: currentUrl,
        };
      }

      await getStartedButton.click();
      await this.randomDelay(2000, 3000);

      // Wait for navigation
      try {
        await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
      } catch (error) {
        return {
          status: 'soft_fail',
          stage: 'create_profile',
          error_code: 'NAVIGATION_TIMEOUT',
          screenshots: this.screenshots,
          url: this.page.url(),
        };
      }

      logger.info('Successfully completed create profile step');
      return {
        status: 'success',
        stage: 'done',
        screenshots: this.screenshots,
        url: this.page.url(),
      };

    } catch (error) {
      return {
        status: 'hard_fail',
        stage: 'create_profile',
        error_code: 'CREATE_PROFILE_FAILED',
        screenshots: this.screenshots,
        url: this.page.url(),
        evidence: error instanceof Error ? error.message : 'Create profile failed',
      };
    }
  }

  private async detectMFAOrCaptcha(): Promise<LoginResult | null> {
    try {
      // Check for reCAPTCHA
      const recaptcha = await this.page.$('iframe[src*="recaptcha"], .g-recaptcha');
      if (recaptcha) {
        return {
          status: 'soft_fail',
          stage: 'password',
          error_code: 'CAPTCHA',
          screenshots: this.screenshots,
          url: this.page.url(),
          evidence: 'reCAPTCHA detected',
        };
      }

      // Check for MFA/OTP fields
      const mfaField = await this.page.$('input[name*="otp"], input[name*="mfa"], input[name*="verification"]');
      if (mfaField) {
        return {
          status: 'soft_fail',
          stage: 'password',
          error_code: 'MFA_REQUIRED',
          screenshots: this.screenshots,
          url: this.page.url(),
          evidence: 'MFA/OTP field detected',
        };
      }

      // Check for suspicious login indicators
      const suspiciousText = await this.page.evaluate(() => {
        const text = document.body.textContent?.toLowerCase() || '';
        return text.includes('suspicious') || text.includes('verify') || text.includes('security');
      });

      if (suspiciousText) {
        // Wait for potential redirection (up to 10 seconds)
        try {
          await this.page.waitForNavigation({ 
            waitUntil: 'networkidle2', 
            timeout: 10000 
          });
        } catch (error) {
          // No redirection occurred, continue
        }

        // Take screenshot of the final page after potential redirection
        this.screenshots.suspicious_page = await this.takeScreenshot('suspicious_page');

        return {
          status: 'soft_fail',
          stage: 'password',
          error_code: 'SUSPICIOUS_LOGIN',
          screenshots: this.screenshots,
          url: this.page.url(),
          evidence: 'Suspicious login indicators detected - user flagged for captcha',
        };
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  private async detectPasswordError(): Promise<LoginResult | null> {
    try {
      // Wait a bit for error to appear
      await new Promise(resolve => setTimeout(resolve, 2000));

      const errorElement = await this.page.$('.error-message, .alert-error, [role="alert"]');
      if (errorElement) {
        const errorText = await errorElement.evaluate(el => el.textContent?.trim() || '');
        if (errorText.toLowerCase().includes('incorrect') || errorText.toLowerCase().includes('password')) {
          return {
            status: 'hard_fail',
            stage: 'password',
            error_code: 'BAD_PASSWORD',
            screenshots: this.screenshots,
            url: this.page.url(),
            evidence: errorText,
          };
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  private async waitForSelectorWithRetry(selectors: string[], timeout: number): Promise<any> {
    for (let attempt = 0; attempt < 3; attempt++) {
      for (const selector of selectors) {
        try {
          const element = await this.page.waitForSelector(selector, {
            timeout: timeout / 3,
            visible: true,
          });
          if (element) return element;
        } catch (error) {
          // Continue to next selector
        }
      }
      
      if (attempt < 2) {
        await this.randomDelay(1000, 2000);
      }
    }
    return null;
  }

  private async typeHumanLike(text: string): Promise<void> {
    for (const char of text) {
      await this.page.keyboard.type(char);
      await this.randomDelay(50, 150);
    }
  }

  private async randomDelay(min: number, max: number): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  private async takeScreenshot(name: string): Promise<string> {
    const timestamp = Date.now();
    const filename = `screenshots/${name}-${timestamp}.png`;
    await this.page.screenshot({ 
      path: filename,
      fullPage: true 
    });
    return filename;
  }
}
