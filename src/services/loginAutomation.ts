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
      experience_before?: string;
      experience_after?: string;
      goal_before?: string;
      goal_after?: string;
      workpref_before?: string;
      workpref_after?: string;
      resume_before?: string;
      resume_after?: string;
      education_before?: string;
      education_after?: string;
      skills_before?: string;
      skills_after?: string;
      overview_before?: string;
      overview_after?: string;
      general_before?: string;
      general_after?: string;
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

      // Wait for page to be fully loaded before input
      await this.waitForPageReady();

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

      // Focus the email field first
      await emailField.focus();
      await this.randomDelay(500, 1000); // Wait for focus to be established
      
      // Clear the field if it has content
      const currentValue = await emailField.evaluate((el: Element) => (el as HTMLInputElement).value);
      if (currentValue) {
        await this.page.keyboard.down('Control');
        await this.page.keyboard.press('KeyA');
        await this.page.keyboard.up('Control');
        await this.page.keyboard.press('Backspace');
        await this.randomDelay(200, 500);
      }
      
      // Type email with human-like delays
      await this.typeHumanLike(this.user.email);
      
      // Verify the email was entered correctly
      const enteredEmail = await emailField.evaluate((el: Element) => (el as HTMLInputElement).value);
      if (enteredEmail !== this.user.email) {
        logger.warn(`Email verification failed. Expected: ${this.user.email}, Got: ${enteredEmail}`);
        
        // Try to clear and retype
        await emailField.focus();
        await this.page.keyboard.down('Control');
        await this.page.keyboard.press('KeyA');
        await this.page.keyboard.up('Control');
        await this.page.keyboard.press('Backspace');
        await this.randomDelay(200, 500);
        await this.typeHumanLike(this.user.email);
        
        // Verify again
        const retryEmail = await emailField.evaluate((el: Element) => (el as HTMLInputElement).value);
        if (retryEmail !== this.user.email) {
          return {
            status: 'soft_fail',
            stage: 'email',
            error_code: 'EMAIL_ENTRY_FAILED',
            screenshots: this.screenshots,
            url: this.page.url(),
            evidence: `Failed to enter email correctly. Expected: ${this.user.email}, Got: ${retryEmail}`,
          };
        }
      }
      
      logger.info(`Email verified: ${enteredEmail}`);
      
      // Take screenshot after email is filled
      this.screenshots.email_filled = await this.takeScreenshot('email_filled');

      // Press Enter to submit the email form
      await this.page.keyboard.press('Enter');
      await this.randomDelay(1000, 2000);

      // Wait for either password form or error
      const passwordField = await this.waitForSelectorWithRetry([
        '#login_password',
        '[aria-label*="Password"]',
        'input[name="login[password]"]',
        'input[type="password"]',
      ], 10000);

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

      // Wait for page to be fully loaded before input
      await this.waitForPageReady();

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

      // Focus the password field first
      await passwordField.focus();
      await this.randomDelay(500, 1000); // Wait for focus to be established
      
      // Clear the field if it has content
      const currentValue = await passwordField.evaluate((el: Element) => (el as HTMLInputElement).value);
      if (currentValue) {
        await this.page.keyboard.down('Control');
        await this.page.keyboard.press('KeyA');
        await this.page.keyboard.up('Control');
        await this.page.keyboard.press('Backspace');
        await this.randomDelay(200, 500);
      }
      
      // Type password with human-like delays (no logging)
      await this.typeHumanLike(this.user.password);
      
      // Verify the password was entered correctly (check length only for security)
      const enteredPassword = await passwordField.evaluate((el: Element) => (el as HTMLInputElement).value);
      if (enteredPassword.length !== this.user.password.length) {
        logger.warn(`Password verification failed. Expected length: ${this.user.password.length}, Got length: ${enteredPassword.length}`);
        
        // Try to clear and retype
        await passwordField.focus();
        await this.page.keyboard.down('Control');
        await this.page.keyboard.press('KeyA');
        await this.page.keyboard.up('Control');
        await this.page.keyboard.press('Backspace');
        await this.randomDelay(200, 500);
        await this.typeHumanLike(this.user.password);
        
        // Verify again
        const retryPassword = await passwordField.evaluate((el: Element) => (el as HTMLInputElement).value);
        if (retryPassword.length !== this.user.password.length) {
          return {
            status: 'soft_fail',
            stage: 'password',
            error_code: 'PASSWORD_ENTRY_FAILED',
            screenshots: this.screenshots,
            url: this.page.url(),
            evidence: `Failed to enter password correctly. Expected length: ${this.user.password.length}, Got length: ${retryPassword.length}`,
          };
        }
      }
      
      logger.info(`Password verified: length ${enteredPassword.length}`);
      
      // Take screenshot after password is filled
      this.screenshots.password_filled = await this.takeScreenshot('password_filled');

      // Press Enter to submit the password form
      await this.page.keyboard.press('Enter');
      await this.randomDelay(2000, 3000);

      // Wait for navigation to complete
      try {
        await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
      } catch (error) {
        // Navigation timeout - check if we're already on the right page
        logger.warn('Navigation timeout, checking current page');
      }

      // Check if we reached create profile page first
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

      // If not on create profile page, check for errors
      const mfaResult = await this.detectMFAOrCaptcha();
      if (mfaResult) {
        return mfaResult;
      }

      const passwordErrorResult = await this.detectPasswordError();
      if (passwordErrorResult) {
        return passwordErrorResult;
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

      // Detect current profile creation step and resume accordingly
      const profileStep = this.detectProfileStep(currentUrl);
      logger.info({ currentUrl, profileStep }, 'Detected profile creation step');

      // Handle different starting points
      if (profileStep === 'initial') {
        // Start from the beginning - click Get Started
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
      }

      // Resume from the appropriate step based on current URL
      return await this.resumeProfileCreation();

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

  private async handleExperienceStep(): Promise<LoginResult> {
    try {
      logger.info('Handling experience step...');

      // Assert current route
      const currentUrl = this.page.url();
      if (!currentUrl.includes('/nx/create-profile/experience')) {
        // Check for landmark element as fallback
        const heading = await this.page.$('h1, h2, [role="heading"]');
        if (heading) {
          const headingText = await heading.evaluate(el => el.textContent?.toLowerCase() || '');
          if (!headingText.includes('how would you like to work') && !headingText.includes('have you freelanced')) {
            return {
              status: 'soft_fail',
              stage: 'create_profile',
              error_code: 'EXPERIENCE_PAGE_NOT_FOUND',
              screenshots: this.screenshots,
              url: currentUrl,
              evidence: `Expected experience page, got ${currentUrl}`,
            };
          }
        } else {
          return {
            status: 'soft_fail',
            stage: 'create_profile',
            error_code: 'EXPERIENCE_PAGE_NOT_FOUND',
            screenshots: this.screenshots,
            url: currentUrl,
            evidence: `Expected experience page, got ${currentUrl}`,
          };
        }
      }

      await this.waitForPageReady();
      this.screenshots.experience_before = await this.takeScreenshot('experience_before');

      // Find and select radio button for freelancing experience
      const radioButton = await this.waitForSelectorWithRetry([
        '[role="radio"][aria-label*="freelanc"]',
        '[role="radio"][aria-label*="Freelanced"]',
        'input[type="radio"][value="FREELANCED_BEFORE"]',
        'input[type="radio"][aria-labelledby*="freelanc"]',
      ], 15000);

      if (!radioButton) {
        // Try alternative selectors
        const altRadioButton = await this.waitForSelectorWithRetry([
          'input[type="radio"]',
          '[role="radio"]',
        ], 5000);
        
        if (!altRadioButton) {
          return {
            status: 'soft_fail',
            stage: 'create_profile',
            error_code: 'EXPERIENCE_RADIO_NOT_FOUND',
            screenshots: this.screenshots,
            url: currentUrl,
            evidence: 'No freelancing experience radio button found',
          };
        }
        await altRadioButton.click();
      } else {
        await radioButton.click();
      }

      // Verify selection
      const isChecked = await radioButton?.evaluate((el: Element) => {
        if (el.getAttribute('role') === 'radio') {
          return el.getAttribute('aria-checked') === 'true';
        } else {
          return (el as HTMLInputElement).checked;
        }
      }) || false;

      if (!isChecked) {
        // Try clicking again
        await radioButton?.click();
        await this.randomDelay(500, 1000);
      }

      await this.randomDelay(1000, 2000);

      // Click Next button
      const nextButton = await this.waitForSelectorWithRetry([
        '[role="button"][aria-label*="Next"]',
        '[data-test="next-button"]',
        'button[data-ev-label="wizard_next"]',
        'button:contains("Next")',
      ], 10000);

      if (!nextButton) {
        return {
          status: 'soft_fail',
          stage: 'create_profile',
          error_code: 'EXPERIENCE_NEXT_NOT_FOUND',
          screenshots: this.screenshots,
          url: currentUrl,
          evidence: 'Next button not found on experience page',
        };
      }

      this.screenshots.experience_after = await this.takeScreenshot('experience_after');
      await nextButton.click();
      await this.randomDelay(2000, 3000);

      // Wait for navigation to goal page
      try {
        await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
      } catch (error) {
        // Check if we're already on the goal page
        const newUrl = this.page.url();
        if (!newUrl.includes('/nx/create-profile/goal')) {
          return {
            status: 'soft_fail',
            stage: 'create_profile',
            error_code: 'EXPERIENCE_NAVIGATION_FAILED',
            screenshots: this.screenshots,
            url: newUrl,
            evidence: 'Failed to navigate to goal page',
          };
        }
      }

      logger.info('Experience step completed successfully');
      return {
        status: 'success',
        stage: 'create_profile',
        screenshots: this.screenshots,
        url: this.page.url(),
      };

    } catch (error) {
      return {
        status: 'soft_fail',
        stage: 'create_profile',
        error_code: 'EXPERIENCE_STEP_FAILED',
        screenshots: this.screenshots,
        url: this.page.url(),
        evidence: error instanceof Error ? error.message : 'Experience step failed',
      };
    }
  }

  private async handleGoalStep(): Promise<LoginResult> {
    try {
      logger.info('Handling goal step...');

      // Assert current route
      const currentUrl = this.page.url();
      if (!currentUrl.includes('/nx/create-profile/goal')) {
        // Check for landmark element as fallback
        const heading = await this.page.$('h1, h2, [role="heading"]');
        if (heading) {
          const headingText = await heading.evaluate(el => el.textContent?.toLowerCase() || '');
          if (!headingText.includes('what is your main goal') && !headingText.includes('primary goal')) {
            return {
              status: 'soft_fail',
              stage: 'create_profile',
              error_code: 'GOAL_PAGE_NOT_FOUND',
              screenshots: this.screenshots,
              url: currentUrl,
              evidence: `Expected goal page, got ${currentUrl}`,
            };
          }
        } else {
          return {
            status: 'soft_fail',
            stage: 'create_profile',
            error_code: 'GOAL_PAGE_NOT_FOUND',
            screenshots: this.screenshots,
            url: currentUrl,
            evidence: `Expected goal page, got ${currentUrl}`,
          };
        }
      }

      await this.waitForPageReady();
      this.screenshots.goal_before = await this.takeScreenshot('goal_before');

      // Find and select radio button for "Exploring" goal
      const radioButton = await this.waitForSelectorWithRetry([
        '[role="radio"][aria-label*="explor"]',
        '[role="radio"][aria-label*="Exploring"]',
        'input[type="radio"][value="EXPLORING"]',
        'input[type="radio"][aria-labelledby*="explor"]',
      ], 15000);

      if (!radioButton) {
        // Try alternative selectors
        const altRadioButton = await this.waitForSelectorWithRetry([
          'input[type="radio"]',
          '[role="radio"]',
        ], 5000);
        
        if (!altRadioButton) {
          return {
            status: 'soft_fail',
            stage: 'create_profile',
            error_code: 'GOAL_RADIO_NOT_FOUND',
            screenshots: this.screenshots,
            url: currentUrl,
            evidence: 'No exploring goal radio button found',
          };
        }
        await altRadioButton.click();
      } else {
        await radioButton.click();
      }

      // Verify selection
      const isChecked = await radioButton?.evaluate((el: Element) => {
        if (el.getAttribute('role') === 'radio') {
          return el.getAttribute('aria-checked') === 'true';
        } else {
          return (el as HTMLInputElement).checked;
        }
      }) || false;

      if (!isChecked) {
        // Try clicking again
        await radioButton?.click();
        await this.randomDelay(500, 1000);
      }

      await this.randomDelay(1000, 2000);

      // Click Next button
      const nextButton = await this.waitForSelectorWithRetry([
        '[role="button"][aria-label*="Next"]',
        '[data-test="next-button"]',
        'button[data-ev-label="wizard_next"]',
        'button:contains("Next")',
      ], 10000);

      if (!nextButton) {
        return {
          status: 'soft_fail',
          stage: 'create_profile',
          error_code: 'GOAL_NEXT_NOT_FOUND',
          screenshots: this.screenshots,
          url: currentUrl,
          evidence: 'Next button not found on goal page',
        };
      }

      this.screenshots.goal_after = await this.takeScreenshot('goal_after');
      await nextButton.click();
      await this.randomDelay(2000, 3000);

      // Wait for navigation to work preference page
      try {
        await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
      } catch (error) {
        // Check if we're already on the work preference page
        const newUrl = this.page.url();
        if (!newUrl.includes('/nx/create-profile/work-preference')) {
          return {
            status: 'soft_fail',
            stage: 'create_profile',
            error_code: 'GOAL_NAVIGATION_FAILED',
            screenshots: this.screenshots,
            url: newUrl,
            evidence: 'Failed to navigate to work preference page',
          };
        }
      }

      logger.info('Goal step completed successfully');
      return {
        status: 'success',
        stage: 'create_profile',
        screenshots: this.screenshots,
        url: this.page.url(),
      };

    } catch (error) {
      return {
        status: 'soft_fail',
        stage: 'create_profile',
        error_code: 'GOAL_STEP_FAILED',
        screenshots: this.screenshots,
        url: this.page.url(),
        evidence: error instanceof Error ? error.message : 'Goal step failed',
      };
    }
  }

  private async handleWorkPreferenceStep(): Promise<LoginResult> {
    try {
      logger.info('Handling work preference step...');

      // Assert current route
      const currentUrl = this.page.url();
      if (!currentUrl.includes('/nx/create-profile/work-preference')) {
        // Check for landmark element as fallback
        const heading = await this.page.$('h1, h2, [role="heading"]');
        if (heading) {
          const headingText = await heading.evaluate(el => el.textContent?.toLowerCase() || '');
          if (!headingText.includes('work preference') && !headingText.includes('how would you like to get paid')) {
            return {
              status: 'soft_fail',
              stage: 'create_profile',
              error_code: 'WORK_PREF_PAGE_NOT_FOUND',
              screenshots: this.screenshots,
              url: currentUrl,
              evidence: `Expected work preference page, got ${currentUrl}`,
            };
          }
        } else {
          return {
            status: 'soft_fail',
            stage: 'create_profile',
            error_code: 'WORK_PREF_PAGE_NOT_FOUND',
            screenshots: this.screenshots,
            url: currentUrl,
            evidence: `Expected work preference page, got ${currentUrl}`,
          };
        }
      }

      await this.waitForPageReady();
      this.screenshots.workpref_before = await this.takeScreenshot('workpref_before');

      // Find and select a checkbox for work preference
      const checkbox = await this.waitForSelectorWithRetry([
        '[role="checkbox"]',
        'input[type="checkbox"]',
      ], 15000);

      if (!checkbox) {
        return {
          status: 'soft_fail',
          stage: 'create_profile',
          error_code: 'WORK_PREF_CHECKBOX_NOT_FOUND',
          screenshots: this.screenshots,
          url: currentUrl,
          evidence: 'No work preference checkbox found',
        };
      }

      // Check if already checked, if not then check it
      const isChecked = await checkbox.evaluate((el: Element) => {
        if (el.getAttribute('role') === 'checkbox') {
          return el.getAttribute('aria-checked') === 'true';
        } else {
          return (el as HTMLInputElement).checked;
        }
      });

      if (!isChecked) {
        await checkbox.click();
        await this.randomDelay(500, 1000);
      }

      await this.randomDelay(1000, 2000);

      // Click Next button
      const nextButton = await this.waitForSelectorWithRetry([
        '[role="button"][aria-label*="Next, create a profile"]',
        '[role="button"][aria-label*="Next"]',
        '[data-test="next-button"]',
        'button[data-ev-label="wizard_next"]',
        'button:contains("Next, create a profile")',
        'button:contains("Next")',
      ], 10000);

      if (!nextButton) {
        return {
          status: 'soft_fail',
          stage: 'create_profile',
          error_code: 'WORK_PREF_NEXT_NOT_FOUND',
          screenshots: this.screenshots,
          url: currentUrl,
          evidence: 'Next button not found on work preference page',
        };
      }

      this.screenshots.workpref_after = await this.takeScreenshot('workpref_after');
      await nextButton.click();
      await this.randomDelay(2000, 3000);

      // Wait for navigation to resume import page
      try {
        await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
      } catch (error) {
        // Check if we're already on the resume import page
        const newUrl = this.page.url();
        if (!newUrl.includes('/nx/create-profile/resume-import')) {
          return {
            status: 'soft_fail',
            stage: 'create_profile',
            error_code: 'WORK_PREF_NAVIGATION_FAILED',
            screenshots: this.screenshots,
            url: newUrl,
            evidence: 'Failed to navigate to resume import page',
          };
        }
      }

      logger.info('Work preference step completed successfully');
      return {
        status: 'success',
        stage: 'create_profile',
        screenshots: this.screenshots,
        url: this.page.url(),
      };

    } catch (error) {
      return {
        status: 'soft_fail',
        stage: 'create_profile',
        error_code: 'WORK_PREF_STEP_FAILED',
        screenshots: this.screenshots,
        url: this.page.url(),
        evidence: error instanceof Error ? error.message : 'Work preference step failed',
      };
    }
  }

  private async handleResumeImportStep(): Promise<LoginResult> {
    try {
      logger.info('Handling resume import step...');

      // Assert current route
      const currentUrl = this.page.url();
      if (!currentUrl.includes('/nx/create-profile/resume-import')) {
        // Check for landmark element as fallback
        const heading = await this.page.$('h1, h2, [role="heading"]');
        if (heading) {
          const headingText = await heading.evaluate(el => el.textContent?.toLowerCase() || '');
          if (!headingText.includes('add your resume') && !headingText.includes('let\'s build your profile')) {
            return {
              status: 'soft_fail',
              stage: 'create_profile',
              error_code: 'RESUME_IMPORT_PAGE_NOT_FOUND',
              screenshots: this.screenshots,
              url: currentUrl,
              evidence: `Expected resume import page, got ${currentUrl}`,
            };
          }
        } else {
          return {
            status: 'soft_fail',
            stage: 'create_profile',
            error_code: 'RESUME_IMPORT_PAGE_NOT_FOUND',
            screenshots: this.screenshots,
            url: currentUrl,
            evidence: `Expected resume import page, got ${currentUrl}`,
          };
        }
      }

      await this.waitForPageReady();
      this.screenshots.resume_before = await this.takeScreenshot('resume_before');

      // Click "Fill out manually" button
      const manualButton = await this.waitForSelectorWithRetry([
        '[role="button"][aria-label*="Fill out manually"]',
        '[data-qa="resume-fill-manually-btn"]',
        'button:contains("Fill out manually")',
        'button:contains("Fill manually")',
      ], 15000);

      if (!manualButton) {
        // Try alternative selectors
        const altButton = await this.waitForSelectorWithRetry([
          'button',
          '[role="button"]',
        ], 5000);
        
        if (!altButton) {
          return {
            status: 'soft_fail',
            stage: 'create_profile',
            error_code: 'RESUME_MANUAL_BUTTON_NOT_FOUND',
            screenshots: this.screenshots,
            url: currentUrl,
            evidence: 'Fill out manually button not found',
          };
        }
        await altButton.click();
      } else {
        await manualButton.click();
      }

      await this.randomDelay(2000, 3000);
      this.screenshots.resume_after = await this.takeScreenshot('resume_after');

      logger.info('Resume import step completed successfully');
      return {
        status: 'success',
        stage: 'create_profile',
        screenshots: this.screenshots,
        url: this.page.url(),
      };

    } catch (error) {
      return {
        status: 'soft_fail',
        stage: 'create_profile',
        error_code: 'RESUME_IMPORT_STEP_FAILED',
        screenshots: this.screenshots,
        url: this.page.url(),
        evidence: error instanceof Error ? error.message : 'Resume import step failed',
      };
    }
  }

  private detectProfileStep(url: string): string {
    if (url.includes('/nx/create-profile/experience')) {
      return 'experience';
    } else if (url.includes('/nx/create-profile/goal')) {
      return 'goal';
    } else if (url.includes('/nx/create-profile/work-preference')) {
      return 'work_preference';
    } else if (url.includes('/nx/create-profile/resume-import')) {
      return 'resume_import';
    } else if (url.includes('/nx/create-profile/education')) {
      return 'education';
    } else if (url.includes('/nx/create-profile/skills')) {
      return 'skills';
    } else if (url.includes('/nx/create-profile/overview')) {
      return 'overview';
    } else if (url.includes('/nx/create-profile/general')) {
      return 'general';
    } else if (url.includes('/nx/create-profile')) {
      return 'initial';
    } else {
      return 'unknown';
    }
  }

  private async resumeProfileCreation(): Promise<LoginResult> {
    try {
      // Get current URL after potential navigation
      const currentUrl = this.page.url();
      const currentStep = this.detectProfileStep(currentUrl);
      
      logger.info({ currentUrl, currentStep }, 'Resuming profile creation from step');

      // Handle each step based on current URL
      switch (currentStep) {
        case 'experience':
          return await this.handleExperienceStep();
          
        case 'goal':
          return await this.handleGoalStep();
          
        case 'work_preference':
          return await this.handleWorkPreferenceStep();
          
        case 'resume_import':
          return await this.handleResumeImportStep();
          
        case 'education':
          return await this.handleEducationStep();
          
        case 'skills':
          return await this.handleSkillsStep();
          
        case 'overview':
          return await this.handleOverviewStep();
          
        case 'general':
          return await this.handleGeneralStep();
          
        default:
          // If we're on an unknown step, try to continue with the normal flow
          logger.warn({ currentStep, currentUrl }, 'Unknown profile step, attempting normal flow');
          
          // Try to handle experience step first
          const experienceResult = await this.handleExperienceStep();
          if (experienceResult.status !== 'success') {
            return experienceResult;
          }

          // Continue with remaining steps
          const goalResult = await this.handleGoalStep();
          if (goalResult.status !== 'success') {
            return goalResult;
          }

          const workPrefResult = await this.handleWorkPreferenceStep();
          if (workPrefResult.status !== 'success') {
            return workPrefResult;
          }

          const resumeResult = await this.handleResumeImportStep();
          if (resumeResult.status !== 'success') {
            return resumeResult;
          }

          logger.info('Successfully completed all create profile steps');
          return {
            status: 'success',
            stage: 'done',
            screenshots: this.screenshots,
            url: this.page.url(),
          };
      }
    } catch (error) {
      return {
        status: 'soft_fail',
        stage: 'create_profile',
        error_code: 'PROFILE_RESUME_FAILED',
        screenshots: this.screenshots,
        url: this.page.url(),
        evidence: error instanceof Error ? error.message : 'Failed to resume profile creation',
      };
    }
  }

  private async handleEducationStep(): Promise<LoginResult> {
    try {
      logger.info('Handling education step...');

      // Assert current route
      const currentUrl = this.page.url();
      if (!currentUrl.includes('/nx/create-profile/education')) {
        return {
          status: 'soft_fail',
          stage: 'create_profile',
          error_code: 'EDUCATION_PAGE_NOT_FOUND',
          screenshots: this.screenshots,
          url: currentUrl,
          evidence: `Expected education page, got ${currentUrl}`,
        };
      }

      await this.waitForPageReady();
      this.screenshots.education_before = await this.takeScreenshot('education_before');

      // Look for "Skip" or "Next" button to continue
      const nextButton = await this.waitForSelectorWithRetry([
        '[role="button"][aria-label*="Skip"]',
        '[role="button"][aria-label*="Next"]',
        '[data-test="next-button"]',
        'button:contains("Skip")',
        'button:contains("Next")',
        'button:contains("Continue")',
      ], 15000);

      if (!nextButton) {
        return {
          status: 'soft_fail',
          stage: 'create_profile',
          error_code: 'EDUCATION_NEXT_NOT_FOUND',
          screenshots: this.screenshots,
          url: currentUrl,
          evidence: 'Next/Skip button not found on education page',
        };
      }

      this.screenshots.education_after = await this.takeScreenshot('education_after');
      await nextButton.click();
      await this.randomDelay(2000, 3000);

      // Wait for navigation to next step
      try {
        await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
      } catch (error) {
        // Check if we're already on the next page
        const newUrl = this.page.url();
        if (!newUrl.includes('/nx/create-profile/')) {
          return {
            status: 'soft_fail',
            stage: 'create_profile',
            error_code: 'EDUCATION_NAVIGATION_FAILED',
            screenshots: this.screenshots,
            url: newUrl,
            evidence: 'Failed to navigate from education page',
          };
        }
      }

      logger.info('Education step completed successfully');
      return {
        status: 'success',
        stage: 'create_profile',
        screenshots: this.screenshots,
        url: this.page.url(),
      };

    } catch (error) {
      return {
        status: 'soft_fail',
        stage: 'create_profile',
        error_code: 'EDUCATION_STEP_FAILED',
        screenshots: this.screenshots,
        url: this.page.url(),
        evidence: error instanceof Error ? error.message : 'Education step failed',
      };
    }
  }

  private async handleSkillsStep(): Promise<LoginResult> {
    try {
      logger.info('Handling skills step...');

      // Assert current route
      const currentUrl = this.page.url();
      if (!currentUrl.includes('/nx/create-profile/skills')) {
        return {
          status: 'soft_fail',
          stage: 'create_profile',
          error_code: 'SKILLS_PAGE_NOT_FOUND',
          screenshots: this.screenshots,
          url: currentUrl,
          evidence: `Expected skills page, got ${currentUrl}`,
        };
      }

      await this.waitForPageReady();
      this.screenshots.skills_before = await this.takeScreenshot('skills_before');

      // Look for "Skip" or "Next" button to continue
      const nextButton = await this.waitForSelectorWithRetry([
        '[role="button"][aria-label*="Skip"]',
        '[role="button"][aria-label*="Next"]',
        '[data-test="next-button"]',
        'button:contains("Skip")',
        'button:contains("Next")',
        'button:contains("Continue")',
      ], 15000);

      if (!nextButton) {
        return {
          status: 'soft_fail',
          stage: 'create_profile',
          error_code: 'SKILLS_NEXT_NOT_FOUND',
          screenshots: this.screenshots,
          url: currentUrl,
          evidence: 'Next/Skip button not found on skills page',
        };
      }

      this.screenshots.skills_after = await this.takeScreenshot('skills_after');
      await nextButton.click();
      await this.randomDelay(2000, 3000);

      // Wait for navigation to next step
      try {
        await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
      } catch (error) {
        // Check if we're already on the next page
        const newUrl = this.page.url();
        if (!newUrl.includes('/nx/create-profile/')) {
          return {
            status: 'soft_fail',
            stage: 'create_profile',
            error_code: 'SKILLS_NAVIGATION_FAILED',
            screenshots: this.screenshots,
            url: newUrl,
            evidence: 'Failed to navigate from skills page',
          };
        }
      }

      logger.info('Skills step completed successfully');
      return {
        status: 'success',
        stage: 'create_profile',
        screenshots: this.screenshots,
        url: this.page.url(),
      };

    } catch (error) {
      return {
        status: 'soft_fail',
        stage: 'create_profile',
        error_code: 'SKILLS_STEP_FAILED',
        screenshots: this.screenshots,
        url: this.page.url(),
        evidence: error instanceof Error ? error.message : 'Skills step failed',
      };
    }
  }

  private async handleOverviewStep(): Promise<LoginResult> {
    try {
      logger.info('Handling overview step...');

      // Assert current route
      const currentUrl = this.page.url();
      if (!currentUrl.includes('/nx/create-profile/overview')) {
        return {
          status: 'soft_fail',
          stage: 'create_profile',
          error_code: 'OVERVIEW_PAGE_NOT_FOUND',
          screenshots: this.screenshots,
          url: currentUrl,
          evidence: `Expected overview page, got ${currentUrl}`,
        };
      }

      await this.waitForPageReady();
      this.screenshots.overview_before = await this.takeScreenshot('overview_before');

      // Look for "Next" or "Continue" button
      const nextButton = await this.waitForSelectorWithRetry([
        '[role="button"][aria-label*="Next"]',
        '[role="button"][aria-label*="Continue"]',
        '[data-test="next-button"]',
        'button:contains("Next")',
        'button:contains("Continue")',
      ], 15000);

      if (!nextButton) {
        return {
          status: 'soft_fail',
          stage: 'create_profile',
          error_code: 'OVERVIEW_NEXT_NOT_FOUND',
          screenshots: this.screenshots,
          url: currentUrl,
          evidence: 'Next button not found on overview page',
        };
      }

      this.screenshots.overview_after = await this.takeScreenshot('overview_after');
      await nextButton.click();
      await this.randomDelay(2000, 3000);

      // Wait for navigation to next step
      try {
        await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
      } catch (error) {
        // Check if we're already on the next page
        const newUrl = this.page.url();
        if (!newUrl.includes('/nx/create-profile/')) {
          return {
            status: 'soft_fail',
            stage: 'create_profile',
            error_code: 'OVERVIEW_NAVIGATION_FAILED',
            screenshots: this.screenshots,
            url: newUrl,
            evidence: 'Failed to navigate from overview page',
          };
        }
      }

      logger.info('Overview step completed successfully');
      return {
        status: 'success',
        stage: 'create_profile',
        screenshots: this.screenshots,
        url: this.page.url(),
      };

    } catch (error) {
      return {
        status: 'soft_fail',
        stage: 'create_profile',
        error_code: 'OVERVIEW_STEP_FAILED',
        screenshots: this.screenshots,
        url: this.page.url(),
        evidence: error instanceof Error ? error.message : 'Overview step failed',
      };
    }
  }

  private async handleGeneralStep(): Promise<LoginResult> {
    try {
      logger.info('Handling general step...');

      // Assert current route
      const currentUrl = this.page.url();
      if (!currentUrl.includes('/nx/create-profile/general')) {
        return {
          status: 'soft_fail',
          stage: 'create_profile',
          error_code: 'GENERAL_PAGE_NOT_FOUND',
          screenshots: this.screenshots,
          url: currentUrl,
          evidence: `Expected general page, got ${currentUrl}`,
        };
      }

      await this.waitForPageReady();
      this.screenshots.general_before = await this.takeScreenshot('general_before');

      // Look for "Next" or "Continue" button
      const nextButton = await this.waitForSelectorWithRetry([
        '[role="button"][aria-label*="Next"]',
        '[role="button"][aria-label*="Continue"]',
        '[data-test="next-button"]',
        'button:contains("Next")',
        'button:contains("Continue")',
      ], 15000);

      if (!nextButton) {
        return {
          status: 'soft_fail',
          stage: 'create_profile',
          error_code: 'GENERAL_NEXT_NOT_FOUND',
          screenshots: this.screenshots,
          url: currentUrl,
          evidence: 'Next button not found on general page',
        };
      }

      this.screenshots.general_after = await this.takeScreenshot('general_after');
      await nextButton.click();
      await this.randomDelay(2000, 3000);

      // Wait for navigation to next step
      try {
        await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
      } catch (error) {
        // Check if we're already on the next page
        const newUrl = this.page.url();
        if (!newUrl.includes('/nx/create-profile/')) {
          return {
            status: 'soft_fail',
            stage: 'create_profile',
            error_code: 'GENERAL_NAVIGATION_FAILED',
            screenshots: this.screenshots,
            url: newUrl,
            evidence: 'Failed to navigate from general page',
          };
        }
      }

      logger.info('General step completed successfully');
      return {
        status: 'success',
        stage: 'create_profile',
        screenshots: this.screenshots,
        url: this.page.url(),
      };

    } catch (error) {
      return {
        status: 'soft_fail',
        stage: 'create_profile',
        error_code: 'GENERAL_STEP_FAILED',
        screenshots: this.screenshots,
        url: this.page.url(),
        evidence: error instanceof Error ? error.message : 'General step failed',
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

      // Check for suspicious login indicators (only if we're still on login page)
      const currentUrl = this.page.url();
      if (currentUrl.includes('/ab/account-security/login')) {
        const suspiciousText = await this.page.evaluate(() => {
          const text = document.body.textContent?.toLowerCase() || '';
          return text.includes('suspicious') || text.includes('verify') || text.includes('security');
        });

        if (suspiciousText) {
          // Take screenshot of the suspicious page
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

  private async waitForPageReady(): Promise<void> {
    try {
      // Wait for the page to be ready by checking if document is complete
      await this.page.waitForFunction(
        () => document.readyState === 'complete',
        { timeout: 10000 }
      );
    } catch (error) {
      // If that fails, just wait 1 second as minimum delay
      logger.warn('Page ready state wait failed, using minimum delay');
    }
    
    // Always add a minimum 1 second delay to ensure page is ready
    await this.randomDelay(1000, 1500);
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
