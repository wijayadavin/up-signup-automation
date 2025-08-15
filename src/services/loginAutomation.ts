import { Page, ElementHandle } from 'puppeteer';
import { getLogger } from '../utils/logger.js';
import type { User } from '../types/database.js';

const logger = getLogger(import.meta.url);

export interface LoginResult {
  status: 'success' | 'soft_fail' | 'hard_fail';
  stage: 'email' | 'password' | 'create_profile' | 'employment_saved' | 'done';
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
      categories_before?: string;
      categories_after?: string;
      skills_selection_before?: string;
      skills_selection_after?: string;
      title_before?: string;
      title_after?: string;
      employment_before?: string;
      modal_before_fill?: string;
      modal_after_fill?: string;
      modal_after_save?: string;
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
            error_code: 'RESUME_NAVIGATION_FAILED',
            screenshots: this.screenshots,
            url: newUrl,
            evidence: 'Failed to navigate from resume import page',
          };
        }
      }

      // Continue with the next steps in the profile creation flow
      const categoriesResult = await this.handleCategoriesStep();
      if (categoriesResult.status !== 'success') {
        return categoriesResult;
      }

      const skillsResult = await this.handleSkillsSelectionStep();
      if (skillsResult.status !== 'success') {
        return skillsResult;
      }

      const titleResult = await this.handleTitleStep();
      if (titleResult.status !== 'success') {
        return titleResult;
      }

      const employmentResult = await this.handleEmploymentStep();
      if (employmentResult.status !== 'success') {
        return employmentResult;
      }

      logger.info('Resume import and profile creation completed successfully');
      return {
        status: 'success',
        stage: 'employment_saved',
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

      // First, look for "Add education" button
      const addEducationButton = await this.waitForSelectorWithRetry([
        '[role="button"][aria-label*="Add education"]',
        '[role="button"][aria-label*="Add Education"]',
        'button:contains("Add education")',
        'button:contains("Add Education")',
        '[data-qa="education-add-btn"]',
        'button[data-ev-label="education_add_btn"]',
      ], 15000);

      if (addEducationButton) {
        logger.info('Found Add education button, clicking it...');
        await addEducationButton.click();
        await this.randomDelay(2000, 3000);

        // Wait for education modal to appear
        const educationModal = await this.waitForSelectorWithRetry([
          '[role="dialog"]',
          '.modal',
          '[data-test="modal"]',
        ], 10000);

        if (educationModal) {
          logger.info('Education modal appeared, filling out education form...');
          
          // Step 1: Wait for specific education modal with proper heading
          const educationModalHandle = await this.waitForEducationModal();
          if (!educationModalHandle) {
            return {
              status: 'soft_fail',
              stage: 'create_profile',
              error_code: 'EDUCATION_MODAL_NOT_FOUND',
              screenshots: this.screenshots,
              url: this.page.url(),
              evidence: 'Education modal with proper heading not found',
            };
          }

          // Step 2: Ensure focus is within modal
          await this.ensureFocusInEducationModal(educationModalHandle);
          
          // Fill out education form with sample data
          const educationData = {
            degree: 'Bachelor of Science (BS)',
            field_of_study: 'Computer Science',
            school_name: 'University of The People',
            country_name: 'United States',
            start_year: '2016',
            end_year: '2020',
            description: 'Studied computer science with focus on software engineering and web development.'
          };

          // Fill school field (plain textbox)
          const schoolResult = await this.fillSchoolField(educationModalHandle, educationData.school_name);
          if (schoolResult.status !== 'success') {
            return schoolResult;
          }

          // Fill degree field (typeahead/combobox)
          const degreeResult = await this.fillDegreeField(educationModalHandle, educationData.degree);
          if (degreeResult.status !== 'success') {
            return degreeResult;
          }

          // Fill field of study (typeahead/combobox with free text fallback)
          const fieldResult = await this.fillFieldOfStudy(educationModalHandle, educationData.field_of_study);
          if (fieldResult.status !== 'success') {
            return fieldResult;
          }

          // Fill country dropdown
          const countryDropdown = await this.waitForSelectorWithRetry([
            '[role="combobox"][aria-label*="Country"]',
            '[role="combobox"][aria-label*="Location"]',
            'select',
          ], 10000);

          if (countryDropdown) {
            await countryDropdown.click();
            await this.randomDelay(500, 1000);

            // Select United States
            const usOption = await this.waitForSelectorWithRetry([
              '[role="option"][aria-label*="United States"]',
              'option[value*="US"]',
              'li:contains("United States")',
            ], 5000);

            if (usOption) {
              await usOption.click();
              await this.randomDelay(500, 1000);
            }
          }

          // Fill start year
          const startYearDropdown = await this.waitForSelectorWithRetry([
            'select[aria-label*="From"]',
            'select[aria-label*="Start"]',
          ], 5000);

          if (startYearDropdown) {
            await startYearDropdown.click();
            await this.randomDelay(500, 1000);
            const year2016Option = await this.page.$(`option[value="${educationData.start_year}"], option:contains("${educationData.start_year}")`);
            if (year2016Option) {
              await year2016Option.click();
            }
          }

          // Fill end year
          const endYearDropdown = await this.waitForSelectorWithRetry([
            'select[aria-label*="To"]',
            'select[aria-label*="End"]',
          ], 5000);

          if (endYearDropdown) {
            await endYearDropdown.click();
            await this.randomDelay(500, 1000);
            const year2020Option = await this.page.$(`option[value="${educationData.end_year}"], option:contains("${educationData.end_year}")`);
            if (year2020Option) {
              await year2020Option.click();
            }
          }

          // Fill description
          const descriptionTextarea = await this.waitForSelectorWithRetry([
            'textarea[aria-labelledby*="description-label"]',
            'textarea[placeholder*="Description"]',
            'textarea',
          ], 10000);

          if (descriptionTextarea) {
            await descriptionTextarea.click();
            await this.typeHumanLike(educationData.description);
            await this.randomDelay(1000, 2000);
          }

          // Save the education entry
          const saveButton = await this.waitForSelectorWithRetry([
            '[role="button"][aria-label*="Save"]',
            '[data-qa="btn-save"]',
            'button[data-ev-label="btn_save"]',
            'button:contains("Save")',
          ], 10000);

          if (saveButton) {
            await saveButton.click();
            await this.randomDelay(2000, 3000);
          }
        }
      }

      // Now look for "Skip" or "Next" button to continue
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

  private async handleCategoriesStep(): Promise<LoginResult> {
    try {
      logger.info('Handling categories step...');

      // Assert current route
      const currentUrl = this.page.url();
      if (!currentUrl.includes('/nx/create-profile/categories')) {
        // Check for landmark element as fallback
        const leftNav = await this.page.$('[role="navigation"]');
        if (!leftNav) {
          return {
            status: 'soft_fail',
            stage: 'create_profile',
            error_code: 'CATEGORIES_PAGE_NOT_FOUND',
            screenshots: this.screenshots,
            url: currentUrl,
            evidence: `Expected categories page, got ${currentUrl}`,
          };
        }
      }

      await this.waitForPageReady();
      this.screenshots.categories_before = await this.takeScreenshot('categories_before');

      // Step 1: Select left menu item "IT & Networking"
      const leftMenuItem = await this.waitForSelectorWithRetry([
        '[role="link"][aria-label*="IT & Networking"]',
        '[role="button"][aria-label*="IT & Networking"]',
        '[data-ev-label="category_activate"][aria-label*="IT"]',
        '[role="link"][aria-label*="IT"]',
        '[role="button"][aria-label*="IT"]',
      ], 15000);

      if (!leftMenuItem) {
        return {
          status: 'soft_fail',
          stage: 'create_profile',
          error_code: 'CATEGORIES_LEFT_ITEM_NOT_FOUND',
          screenshots: this.screenshots,
          url: currentUrl,
          evidence: 'IT & Networking left menu item not found',
        };
      }

      await leftMenuItem.click();
      await this.randomDelay(1000, 2000);

      // Step 2: Select right checkbox "Information Security & Compliance"
      const checkbox = await this.waitForSelectorWithRetry([
        '[role="checkbox"][aria-label*="Information Security"]',
        '[role="checkbox"][aria-label*="Compliance"]',
        'label[data-test="checkbox-label"] input[type="checkbox"]',
        'input[type="checkbox"][aria-label*="Information Security"]',
        'input[type="checkbox"][aria-label*="Compliance"]',
      ], 15000);

      if (!checkbox) {
        return {
          status: 'soft_fail',
          stage: 'create_profile',
          error_code: 'CATEGORIES_RIGHT_CHECKBOX_NOT_FOUND',
          screenshots: this.screenshots,
          url: currentUrl,
          evidence: 'Information Security & Compliance checkbox not found',
        };
      }

      // Check if already selected, if not then check it
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

      // Step 3: Click continue button
      const nextButton = await this.waitForSelectorWithRetry([
        '[role="button"][aria-label*="Next"][aria-label*="add your skills"]',
        '[data-test="next-button"]',
        'button[data-ev-label="wizard_next"]',
        'button:contains("Next")',
        'button:contains("Continue")',
      ], 15000);

      if (!nextButton) {
        return {
          status: 'soft_fail',
          stage: 'create_profile',
          error_code: 'CATEGORIES_NEXT_NOT_FOUND',
          screenshots: this.screenshots,
          url: currentUrl,
          evidence: 'Next button not found on categories page',
        };
      }

      this.screenshots.categories_after = await this.takeScreenshot('categories_after');
      await nextButton.click();
      await this.randomDelay(2000, 3000);

      // Wait for navigation to skills page
      try {
        await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
      } catch (error) {
        // Check if we're already on the skills page
        const newUrl = this.page.url();
        if (!newUrl.includes('/nx/create-profile/skills')) {
          return {
            status: 'soft_fail',
            stage: 'create_profile',
            error_code: 'CATEGORIES_NAVIGATION_FAILED',
            screenshots: this.screenshots,
            url: newUrl,
            evidence: 'Failed to navigate to skills page',
          };
        }
      }

      logger.info('Categories step completed successfully');
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
        error_code: 'CATEGORIES_STEP_FAILED',
        screenshots: this.screenshots,
        url: this.page.url(),
        evidence: error instanceof Error ? error.message : 'Categories step failed',
      };
    }
  }

  private async handleSkillsSelectionStep(): Promise<LoginResult> {
    try {
      logger.info('Handling skills selection step...');

      // Assert current route
      const currentUrl = this.page.url();
      if (!currentUrl.includes('/nx/create-profile/skills')) {
        // Check for landmark element as fallback
        const tokenContainer = await this.page.$('[aria-labelledby="token-container-label"]');
        if (!tokenContainer) {
          return {
            status: 'soft_fail',
            stage: 'create_profile',
            error_code: 'SKILLS_PAGE_NOT_FOUND',
            screenshots: this.screenshots,
            url: currentUrl,
            evidence: `Expected skills page, got ${currentUrl}`,
          };
        }
      }

      await this.waitForPageReady();
      this.screenshots.skills_selection_before = await this.takeScreenshot('skills_selection_before');

      // Step 1: Select suggestion chips (tokens)
      const tokenButtons = await this.page.$$('[role="button"][aria-label]');
      
      if (tokenButtons.length === 0) {
        // Try fallback selectors
        const fallbackTokens = await this.page.$$('div[role="button"][aria-label]');
        if (fallbackTokens.length === 0) {
          return {
            status: 'soft_fail',
            stage: 'create_profile',
            error_code: 'SKILLS_TOKEN_NOT_FOUND',
            screenshots: this.screenshots,
            url: currentUrl,
            evidence: 'No skill tokens found on skills page',
          };
        }
        // Use fallback tokens
        for (let i = 0; i < Math.min(3, fallbackTokens.length); i++) {
          await fallbackTokens[i].click();
          await this.randomDelay(500, 1000);
        }
      } else {
        // Use primary tokens
        for (let i = 0; i < Math.min(3, tokenButtons.length); i++) {
          await tokenButtons[i].click();
          await this.randomDelay(500, 1000);
        }
      }

      await this.randomDelay(1000, 2000);

      // Step 2: Click next button
      const nextButton = await this.waitForSelectorWithRetry([
        '[role="button"][aria-label*="Next"][aria-label*="profile title"]',
        '[data-test="next-button"]',
        'button[data-ev-label="wizard_next"]',
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
          evidence: 'Next button not found on skills page',
        };
      }

      this.screenshots.skills_selection_after = await this.takeScreenshot('skills_selection_after');
      await nextButton.click();
      await this.randomDelay(2000, 3000);

      // Wait for navigation to title page
      try {
        await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
      } catch (error) {
        // Check if we're already on the title page
        const newUrl = this.page.url();
        if (!newUrl.includes('/nx/create-profile/title')) {
          return {
            status: 'soft_fail',
            stage: 'create_profile',
            error_code: 'SKILLS_NAVIGATION_FAILED',
            screenshots: this.screenshots,
            url: newUrl,
            evidence: 'Failed to navigate to title page',
          };
        }
      }

      logger.info('Skills selection step completed successfully');
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
        error_code: 'SKILLS_SELECTION_STEP_FAILED',
        screenshots: this.screenshots,
        url: this.page.url(),
        evidence: error instanceof Error ? error.message : 'Skills selection step failed',
      };
    }
  }

  private async handleTitleStep(): Promise<LoginResult> {
    try {
      logger.info('Handling title step...');

      // Assert current route
      const currentUrl = this.page.url();
      if (!currentUrl.includes('/nx/create-profile/title')) {
        // Check for landmark element as fallback
        const titleInput = await this.page.$('input[aria-labelledby="title-label"]');
        if (!titleInput) {
          return {
            status: 'soft_fail',
            stage: 'create_profile',
            error_code: 'TITLE_PAGE_NOT_FOUND',
            screenshots: this.screenshots,
            url: currentUrl,
            evidence: `Expected title page, got ${currentUrl}`,
          };
        }
      }

      await this.waitForPageReady();
      this.screenshots.title_before = await this.takeScreenshot('title_before');

      // Step 1: Type profile title
      const titleInput = await this.waitForSelectorWithRetry([
        'input[aria-labelledby="title-label"]',
        'input[placeholder*="Example"]',
        'input[type="text"][aria-label*="title"]',
        'input[type="text"][placeholder*="title"]',
      ], 15000);

      if (!titleInput) {
        return {
          status: 'soft_fail',
          stage: 'create_profile',
          error_code: 'TITLE_INPUT_NOT_FOUND',
          screenshots: this.screenshots,
          url: currentUrl,
          evidence: 'Title input field not found',
        };
      }

      // Clear the field first
      await titleInput.click();
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('KeyA');
      await this.page.keyboard.up('Control');
      await this.page.keyboard.press('Backspace');
      await this.randomDelay(500, 1000);

      // Type the title
      await this.typeHumanLike('Full-Stack Software Engineer');
      await this.randomDelay(1000, 2000);

      // Step 2: Click next button
      const nextButton = await this.waitForSelectorWithRetry([
        '[role="button"][aria-label*="Add experience"]',
        '[data-test="next-button"]',
        'button[data-ev-label="wizard_next"]',
        'button:contains("Add experience")',
        'button:contains("Next")',
        'button:contains("Continue")',
      ], 15000);

      if (!nextButton) {
        return {
          status: 'soft_fail',
          stage: 'create_profile',
          error_code: 'TITLE_NEXT_NOT_FOUND',
          screenshots: this.screenshots,
          url: currentUrl,
          evidence: 'Next button not found on title page',
        };
      }

      this.screenshots.title_after = await this.takeScreenshot('title_after');
      await nextButton.click();
      await this.randomDelay(2000, 3000);

      // Wait for navigation to employment page
      try {
        await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
      } catch (error) {
        // Check if we're already on the employment page
        const newUrl = this.page.url();
        if (!newUrl.includes('/nx/create-profile/employment')) {
          return {
            status: 'soft_fail',
            stage: 'create_profile',
            error_code: 'TITLE_NAVIGATION_FAILED',
            screenshots: this.screenshots,
            url: newUrl,
            evidence: 'Failed to navigate to employment page',
          };
        }
      }

      logger.info('Title step completed successfully');
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
        error_code: 'TITLE_STEP_FAILED',
        screenshots: this.screenshots,
        url: this.page.url(),
        evidence: error instanceof Error ? error.message : 'Title step failed',
      };
    }
  }

  private async handleEmploymentStep(): Promise<LoginResult> {
    try {
      logger.info('Handling employment step...');

      // Assert current route
      const currentUrl = this.page.url();
      if (!currentUrl.includes('/nx/create-profile/employment')) {
        // Check for landmark element as fallback
        const employmentHeading = await this.page.$('h1, h2, [role="heading"]');
        if (employmentHeading) {
          const headingText = await employmentHeading.evaluate(el => el.textContent?.toLowerCase() || '');
          if (!headingText.includes('employment') && !headingText.includes('experience')) {
            return {
              status: 'soft_fail',
              stage: 'create_profile',
              error_code: 'EMPLOYMENT_PAGE_NOT_FOUND',
              screenshots: this.screenshots,
              url: currentUrl,
              evidence: `Expected employment page, got ${currentUrl}`,
            };
          }
        } else {
          return {
            status: 'soft_fail',
            stage: 'create_profile',
            error_code: 'EMPLOYMENT_PAGE_NOT_FOUND',
            screenshots: this.screenshots,
            url: currentUrl,
            evidence: `Expected employment page, got ${currentUrl}`,
          };
        }
      }

      await this.waitForPageReady();
      this.screenshots.employment_before = await this.takeScreenshot('employment_before');

      // Step 1: Open "Add experience" modal
      const addButton = await this.waitForSelectorWithRetry([
        '[role="button"][aria-label*="Add experience"]',
        '[data-qa="employment-add-btn"]',
        'button[data-ev-label="employment_add_btn"]',
        'button:contains("Add experience")',
        'button:contains("Add Experience")',
      ], 15000);

      if (!addButton) {
        return {
          status: 'soft_fail',
          stage: 'create_profile',
          error_code: 'EMPLOYMENT_ADD_BUTTON_NOT_FOUND',
          screenshots: this.screenshots,
          url: currentUrl,
          evidence: 'Add experience button not found',
        };
      }

      await addButton.click();
      await this.randomDelay(2000, 3000);

      // Wait for modal to appear
      const modal = await this.waitForSelectorWithRetry([
        '[role="dialog"]',
        '.modal',
        '[data-test="modal"]',
      ], 10000);

      if (!modal) {
        return {
          status: 'soft_fail',
          stage: 'create_profile',
          error_code: 'EMPLOYMENT_MODAL_NOT_VISIBLE',
          screenshots: this.screenshots,
          url: currentUrl,
          evidence: 'Employment modal did not appear',
        };
      }

      this.screenshots.modal_before_fill = await this.takeScreenshot('modal_before_fill');

      // Fill out the employment form with sample data
      const employmentData = {
        work_title: 'Senior Software Engineer',
        work_company_name: 'Tech Solutions Inc',
        country_name: 'United States',
        work_start_year: '2020',
        work_end_year: '2023',
        work_description: 'Developed full-stack web applications using modern technologies. Led a team of 5 developers and implemented CI/CD pipelines.'
      };

      // Fill title field
      const titleInput = await this.waitForSelectorWithRetry([
        'input[aria-labelledby*="title-label"]',
        'input[role="combobox"][type="search"]',
        'input[data-ev-label="typeahead_input"]',
        'input[placeholder*="Title"]',
      ], 10000);

      if (!titleInput) {
        return {
          status: 'soft_fail',
          stage: 'create_profile',
          error_code: 'MODAL_TITLE_INPUT_NOT_FOUND',
          screenshots: this.screenshots,
          url: currentUrl,
          evidence: 'Title input not found in modal',
        };
      }

      await titleInput.click();
      await this.typeHumanLike(employmentData.work_title);
      await this.randomDelay(1000, 2000);

      // Fill company field
      const companyInput = await this.waitForSelectorWithRetry([
        'input[aria-labelledby*="company-label"]',
        'input[placeholder*="Company"]',
        'input[data-ev-label="typeahead_input"]',
      ], 10000);

      if (!companyInput) {
        return {
          status: 'soft_fail',
          stage: 'create_profile',
          error_code: 'MODAL_COMPANY_INPUT_NOT_FOUND',
          screenshots: this.screenshots,
          url: currentUrl,
          evidence: 'Company input not found in modal',
        };
      }

      await companyInput.click();
      await this.typeHumanLike(employmentData.work_company_name);
      await this.randomDelay(1000, 2000);

      // Fill country dropdown
      const countryDropdown = await this.waitForSelectorWithRetry([
        '[role="combobox"][aria-label*="Country"]',
        '[role="combobox"][aria-label*="Location"]',
        '[data-test="dropdown-toggle"]',
        'select',
      ], 10000);

      if (!countryDropdown) {
        return {
          status: 'soft_fail',
          stage: 'create_profile',
          error_code: 'MODAL_COUNTRY_NOT_FOUND',
          screenshots: this.screenshots,
          url: currentUrl,
          evidence: 'Country dropdown not found in modal',
        };
      }

      await countryDropdown.click();
      await this.randomDelay(500, 1000);

      // Select United States
      const usOption = await this.waitForSelectorWithRetry([
        '[role="option"][aria-label*="United States"]',
        'option[value*="US"]',
        'li:contains("United States")',
      ], 5000);

      if (usOption) {
        await usOption.click();
        await this.randomDelay(500, 1000);
      }

      // Fill start date (simplified - just click and select)
      const startMonthDropdown = await this.waitForSelectorWithRetry([
        'select[aria-label*="From"]',
        'select[aria-label*="Start"]',
      ], 5000);

      if (startMonthDropdown) {
        await startMonthDropdown.click();
        await this.randomDelay(500, 1000);
        // Select January
        const januaryOption = await this.page.$('option[value="1"], option:contains("January")');
        if (januaryOption) {
          await januaryOption.click();
        }
      }

      const startYearDropdown = await this.waitForSelectorWithRetry([
        'select[aria-label*="Year"]',
      ], 5000);

      if (startYearDropdown) {
        await startYearDropdown.click();
        await this.randomDelay(500, 1000);
        // Select 2020
        const year2020Option = await this.page.$(`option[value="${employmentData.work_start_year}"], option:contains("${employmentData.work_start_year}")`);
        if (year2020Option) {
          await year2020Option.click();
        }
      }

      // Fill end date
      const endMonthDropdown = await this.waitForSelectorWithRetry([
        'select[aria-label*="To"]',
        'select[aria-label*="End"]',
      ], 5000);

      if (endMonthDropdown) {
        await endMonthDropdown.click();
        await this.randomDelay(500, 1000);
        // Select December
        const decemberOption = await this.page.$('option[value="12"], option:contains("December")');
        if (decemberOption) {
          await decemberOption.click();
        }
      }

      const endYearDropdown = await this.waitForSelectorWithRetry([
        'select[aria-label*="Year"]',
      ], 5000);

      if (endYearDropdown) {
        await endYearDropdown.click();
        await this.randomDelay(500, 1000);
        // Select 2023
        const year2023Option = await this.page.$(`option[value="${employmentData.work_end_year}"], option:contains("${employmentData.work_end_year}")`);
        if (year2023Option) {
          await year2023Option.click();
        }
      }

      // Fill description
      const descriptionTextarea = await this.waitForSelectorWithRetry([
        'textarea[aria-labelledby*="description-label"]',
        'textarea[placeholder*="Description"]',
        'textarea',
      ], 10000);

      if (!descriptionTextarea) {
        return {
          status: 'soft_fail',
          stage: 'create_profile',
          error_code: 'MODAL_DESCRIPTION_NOT_FOUND',
          screenshots: this.screenshots,
          url: currentUrl,
          evidence: 'Description textarea not found in modal',
        };
      }

      await descriptionTextarea.click();
      await this.typeHumanLike(employmentData.work_description);
      await this.randomDelay(1000, 2000);

      this.screenshots.modal_after_fill = await this.takeScreenshot('modal_after_fill');

      // Step 7: Save the employment entry
      const saveButton = await this.waitForSelectorWithRetry([
        '[role="button"][aria-label*="Save"]',
        '[data-qa="btn-save"]',
        'button[data-ev-label="btn_save"]',
        'button:contains("Save")',
      ], 10000);

      if (!saveButton) {
        return {
          status: 'soft_fail',
          stage: 'create_profile',
          error_code: 'MODAL_SAVE_NOT_FOUND',
          screenshots: this.screenshots,
          url: currentUrl,
          evidence: 'Save button not found in modal',
        };
      }

      await saveButton.click();
      await this.randomDelay(2000, 3000);

      this.screenshots.modal_after_save = await this.takeScreenshot('modal_after_save');

      // Verify the modal closed and employment entry was added
      const modalStillOpen = await this.page.$('[role="dialog"]');
      if (modalStillOpen) {
        return {
          status: 'soft_fail',
          stage: 'create_profile',
          error_code: 'EMPLOYMENT_ENTRY_NOT_CONFIRMED',
          screenshots: this.screenshots,
          url: currentUrl,
          evidence: 'Modal did not close after saving',
        };
      }

      logger.info('Employment step completed successfully');
      return {
        status: 'success',
        stage: 'employment_saved',
        screenshots: this.screenshots,
        url: this.page.url(),
      };

    } catch (error) {
      return {
        status: 'soft_fail',
        stage: 'create_profile',
        error_code: 'EMPLOYMENT_STEP_FAILED',
        screenshots: this.screenshots,
        url: this.page.url(),
        evidence: error instanceof Error ? error.message : 'Employment step failed',
      };
    }
  }

    private async fillDropdownField(
    fieldName: string,
    targetValue: string,
    selectors: string[]
  ): Promise<LoginResult> {
    try {
      logger.info({ fieldName, targetValue }, 'Filling dropdown field with keyboard-only approach');

      // Step 1: Modal Guard - Wait for modal and store handle
      const modal = await this.waitForModalDialog();
      if (!modal) {
        return {
          status: 'soft_fail',
          stage: 'create_profile',
          error_code: 'MODAL_NOT_FOUND',
          screenshots: this.screenshots,
          url: this.page.url(),
          evidence: 'Modal dialog not found when trying to fill dropdown field',
        };
      }

      // Step 2: Find and focus the input field within modal
      const inputField = await this.findInputInModal(fieldName, selectors, modal);
      if (!inputField) {
        return {
          status: 'soft_fail',
          stage: 'create_profile',
          error_code: 'FIELD_INPUT_NOT_FOUND',
          screenshots: this.screenshots,
          url: this.page.url(),
          evidence: `Input field for ${fieldName} not found within modal`,
        };
      }

      // Step 3: Ensure focus is within modal
      await this.ensureFocusInModal(modal, inputField);

      // Take screenshot before interaction
      (this.screenshots as any)[`${fieldName}_before`] = await this.takeScreenshot(`${fieldName}_before`);

      // Step 4: Execute keyboard-only dropdown selection
      const result = await this.executeKeyboardDropdownSelection(inputField, targetValue, fieldName, modal);
      
      if (result.status !== 'success') {
        return result;
      }

      // Take screenshot after selection
      (this.screenshots as any)[`${fieldName}_after`] = await this.takeScreenshot(`${fieldName}_after`);

      logger.info({ fieldName, fieldValue: result.fieldValue }, 'Dropdown field filled successfully');
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
        error_code: `${fieldName.toUpperCase()}_FILL_FAILED`,
        screenshots: this.screenshots,
        url: this.page.url(),
        evidence: error instanceof Error ? error.message : `Failed to fill ${fieldName} field`,
      };
    }
  }

  private async waitForEducationModal(): Promise<ElementHandle<Element> | null> {
    try {
      // Wait for education modal with specific heading
      const modal = await this.page.waitForFunction(() => {
        const dialogs = document.querySelectorAll('[role="dialog"], [aria-modal="true"]');
        for (const dialog of dialogs) {
          const heading = dialog.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"]');
          if (heading) {
            const headingText = heading.textContent?.toLowerCase() || '';
            if (headingText.includes('add education') || headingText.includes('education history')) {
              return dialog;
            }
          }
        }
        return null;
      }, { timeout: 10000 });

      if (modal) {
        logger.info('Education modal found with proper heading');
        return modal as ElementHandle<Element>;
      }
      
      return null;
    } catch (error) {
      logger.warn('Education modal not found or not visible');
      return null;
    }
  }

  private async ensureFocusInEducationModal(modal: ElementHandle<Element>): Promise<void> {
    try {
      // Check if active element is within modal
      const activeElementInModal = await this.page.evaluate((modalEl: Element) => {
        const activeEl = document.activeElement;
        return activeEl && modalEl.contains(activeEl);
      }, modal);
      
      if (!activeElementInModal) {
        logger.info('Active element not in education modal, focusing first focusable element');
        // Focus first focusable element in modal
        await modal.evaluate((modalEl: Element) => {
          const focusable = modalEl.querySelector('input, button, select, textarea, [tabindex]:not([tabindex="-1"])') as HTMLElement;
          if (focusable) {
            focusable.focus();
          }
        });
        await this.randomDelay(200, 300);
      }
    } catch (error) {
      logger.warn('Error ensuring focus in education modal, continuing...');
    }
  }

  private async fillSchoolField(modal: ElementHandle<Element>, schoolName: string): Promise<LoginResult> {
    try {
      logger.info({ schoolName }, 'Filling school field (typeahead/combobox)');
      
      // Find school input within modal - it's a typeahead/combobox field
      const schoolInput = await modal.evaluateHandle((modalEl: Element, schoolName: string) => {
        // Primary: role="combobox" with aria-labelledby containing "school"
        const inputs = modalEl.querySelectorAll('input[role="combobox"], input[aria-autocomplete]');
        for (const input of inputs) {
          const label = input.getAttribute('aria-labelledby');
          const placeholder = input.getAttribute('placeholder');
          const name = input.getAttribute('name');
          
          if (label && label.toLowerCase().includes('school')) {
            return input;
          }
          if (placeholder && placeholder.toLowerCase().includes('school')) {
            return input;
          }
          if (name && name.toLowerCase().includes('school')) {
            return input;
          }
        }
        
        // Fallback: input with placeholder starting with "Ex:" and aria-labelledby containing "school"
        const exInputs = modalEl.querySelectorAll('input[placeholder^="Ex:"]');
        for (const input of exInputs) {
          const label = input.getAttribute('aria-labelledby');
          if (label && label.toLowerCase().includes('school')) {
            return input;
          }
        }
        
        return null;
      }, schoolName);
      
      const inputElement = await schoolInput.asElement();
      if (!inputElement) {
        return {
          status: 'soft_fail',
          stage: 'create_profile',
          error_code: 'SCHOOL_INPUT_NOT_FOUND',
          screenshots: this.screenshots,
          url: this.page.url(),
          evidence: 'School input field not found within education modal',
        };
      }

      // Use keyboard-only dropdown selection for typeahead field
      const result = await this.executeKeyboardDropdownSelection(inputElement as ElementHandle<Element>, schoolName, 'school', modal);
      return result;
      
    } catch (error) {
      return {
        status: 'soft_fail',
        stage: 'create_profile',
        error_code: 'SCHOOL_FILL_FAILED',
        screenshots: this.screenshots,
        url: this.page.url(),
        evidence: error instanceof Error ? error.message : 'Failed to fill school field',
      };
    }
  }

  private async fillDegreeField(modal: ElementHandle<Element>, degreeName: string): Promise<LoginResult> {
    try {
      logger.info({ degreeName }, 'Filling degree field (typeahead/combobox)');
      
      // Find degree input within modal
      const degreeInput = await modal.evaluateHandle((modalEl: Element, degreeName: string) => {
        const inputs = modalEl.querySelectorAll('input[role="combobox"], input[aria-autocomplete]');
        for (const input of inputs) {
          const label = input.getAttribute('aria-labelledby');
          const placeholder = input.getAttribute('placeholder');
          const name = input.getAttribute('name');
          
          // Exact match for degree-label
          if (label === 'degree-label') {
            return input;
          }
          // Fallback: contains "degree"
          if (label && label.toLowerCase().includes('degree')) {
            return input;
          }
          if (placeholder && placeholder.toLowerCase().includes('degree')) {
            return input;
          }
          if (name && name.toLowerCase().includes('degree')) {
            return input;
          }
        }
        return null;
      }, degreeName);
      
      const inputElement = await degreeInput.asElement();
      if (!inputElement) {
        // Simple fallback: just press Tab to move to next field
        logger.info({ degreeName }, 'Degree input not found, pressing Tab to move to next field');
        await this.page.keyboard.press('Tab');
        await this.randomDelay(200, 300);
        return {
          status: 'success',
          stage: 'create_profile',
          screenshots: this.screenshots,
          url: this.page.url(),
        };
      }

      // Use keyboard-only dropdown selection
      const result = await this.executeKeyboardDropdownSelection(inputElement as ElementHandle<Element>, degreeName, 'degree', modal);
      return result;
      
    } catch (error) {
      return {
        status: 'soft_fail',
        stage: 'create_profile',
        error_code: 'DEGREE_FILL_FAILED',
        screenshots: this.screenshots,
        url: this.page.url(),
        evidence: error instanceof Error ? error.message : 'Failed to fill degree field',
      };
    }
  }

  private async fillFieldOfStudy(modal: ElementHandle<Element>, fieldName: string): Promise<LoginResult> {
    try {
      logger.info({ fieldName }, 'Filling field of study (typeahead with free text fallback)');
      
      // Find field of study input within modal
      const fieldInput = await modal.evaluateHandle((modalEl: Element, fieldName: string) => {
        const inputs = modalEl.querySelectorAll('input[role="combobox"], input[aria-autocomplete], input[type="text"]');
        for (const input of inputs) {
          const label = input.getAttribute('aria-labelledby');
          const placeholder = input.getAttribute('placeholder');
          const name = input.getAttribute('name');
          
          if (label && (label.toLowerCase().includes('field') || label.toLowerCase().includes('major'))) {
            return input;
          }
          if (placeholder && (placeholder.toLowerCase().includes('field') || placeholder.toLowerCase().includes('major'))) {
            return input;
          }
          if (name && (name.toLowerCase().includes('field') || name.toLowerCase().includes('major'))) {
            return input;
          }
        }
        return null;
      }, fieldName);
      
      const inputElement = await fieldInput.asElement();
      if (!inputElement) {
        return {
          status: 'soft_fail',
          stage: 'create_profile',
          error_code: 'FIELD_OF_STUDY_INPUT_NOT_FOUND',
          screenshots: this.screenshots,
          url: this.page.url(),
          evidence: 'Field of study input field not found within education modal',
        };
      }

      // Focus and clear the field
      await inputElement.focus();
      await this.randomDelay(200, 300);
      
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('KeyA');
      await this.page.keyboard.up('Control');
      await this.page.keyboard.press('Backspace');
      await this.randomDelay(200, 300);
      
      // Type the field name
      await this.typeHumanLike(fieldName);
      await this.randomDelay(500, 1000);
      
      // Wait for listbox to appear (2s timeout)
      const listboxAppeared = await this.waitForListboxInModal(modal, fieldName);
      
      if (listboxAppeared) {
        // Use dropdown selection
        await this.page.keyboard.press('ArrowDown');
        await this.randomDelay(200, 300);
        await this.page.keyboard.press('Enter');
        await this.randomDelay(500, 1000);
      } else {
        // Accept raw text (Upwork allows custom values)
        logger.info({ fieldName }, 'No listbox appeared, accepting raw text input');
        await this.page.keyboard.press('Enter');
        await this.randomDelay(500, 1000);
      }
      
      // Verify the value was set
      const fieldValue = await inputElement.evaluate((el: Node) => (el as HTMLInputElement).value);
      if (!fieldValue || (fieldValue as string).trim() === '') {
        return {
          status: 'soft_fail',
          stage: 'create_profile',
          error_code: 'FIELD_OF_STUDY_VALUE_NOT_SET',
          screenshots: this.screenshots,
          url: this.page.url(),
          evidence: 'Field of study value was not set',
        };
      }
      
      logger.info({ fieldName, fieldValue }, 'Field of study filled successfully');
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
        error_code: 'FIELD_OF_STUDY_FILL_FAILED',
        screenshots: this.screenshots,
        url: this.page.url(),
        evidence: error instanceof Error ? error.message : 'Failed to fill field of study',
      };
    }
  }

  private async waitForModalDialog(): Promise<ElementHandle<Element> | null> {
    try {
      const modal = await this.page.waitForSelector('[role="dialog"]', { timeout: 10000 });
      if (modal) {
        // Verify modal is visible
        const isVisible = await modal.evaluate((el: Element) => {
          const style = window.getComputedStyle(el as HTMLElement);
          return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        });
        
        if (isVisible) {
          logger.info('Modal dialog found and visible');
          return modal;
        }
      }
      return null;
    } catch (error) {
      logger.warn('Modal dialog not found or not visible');
      return null;
    }
  }

  private async findInputInModal(
    fieldName: string, 
    selectors: string[], 
    modal: ElementHandle<Element>
  ): Promise<ElementHandle<Element> | null> {
    try {
      // Try to find input within the modal context
      for (const selector of selectors) {
        const input = await modal.$(selector);
        if (input) {
          // Verify it's editable
          const isEditable = await input.evaluate((el: Element) => {
            const inputEl = el as HTMLInputElement;
            return !inputEl.disabled && !inputEl.readOnly;
          });
          
          if (isEditable) {
            logger.info({ fieldName, selector }, 'Found editable input field in modal');
            return input;
          }
        }
      }
      
      // Fallback: search for any input with accessible name containing field name
      const fallbackInput = await modal.evaluateHandle((modalEl: Element, fieldName: string) => {
        const inputs = modalEl.querySelectorAll('input[role="combobox"], input[aria-autocomplete], input[type="text"]');
        for (const input of inputs) {
          const label = input.getAttribute('aria-labelledby');
          const placeholder = input.getAttribute('placeholder');
          const name = input.getAttribute('name');
          
          if (label && label.toLowerCase().includes(fieldName.toLowerCase())) {
            return input;
          }
          if (placeholder && placeholder.toLowerCase().includes(fieldName.toLowerCase())) {
            return input;
          }
          if (name && name.toLowerCase().includes(fieldName.toLowerCase())) {
            return input;
          }
        }
        return null;
      }, fieldName);
      
      const inputElement = await fallbackInput.asElement();
      if (inputElement) {
        logger.info({ fieldName }, 'Found input field using fallback search');
        return inputElement as ElementHandle<Element>;
      }
      
      return null;
    } catch (error) {
      logger.warn({ fieldName, error }, 'Error finding input in modal');
      return null;
    }
  }

  private async ensureFocusInModal(
    modal: ElementHandle<Element>, 
    inputField: ElementHandle<Element>
  ): Promise<void> {
    try {
      // Check if active element is within modal
      const activeElementInModal = await this.page.evaluate((modalEl: Element) => {
        const activeEl = document.activeElement;
        return activeEl && modalEl.contains(activeEl);
      }, modal);
      
      if (!activeElementInModal) {
        logger.info('Active element not in modal, focusing modal and tabbing to input');
        // Focus modal and tab to input
        await modal.focus();
        await this.page.keyboard.press('Tab');
        await this.randomDelay(200, 500);
      }
      
      // Ensure input is focused
      await inputField.focus();
      await this.randomDelay(200, 500);
    } catch (error) {
      logger.warn('Error ensuring focus in modal, continuing...');
    }
  }

  private async executeKeyboardDropdownSelection(
    inputField: ElementHandle<Element>,
    targetValue: string,
    fieldName: string,
    modal: ElementHandle<Element>
  ): Promise<LoginResult & { fieldValue?: string }> {
    try {
      // Step 1: Clear existing text
      await inputField.click();
      await this.randomDelay(200, 400);
      
      // Select all and delete
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('KeyA');
      await this.page.keyboard.up('Control');
      await this.page.keyboard.press('Backspace');
      await this.randomDelay(200, 400);

      // Step 2: Type value with per-keystroke delay
      for (let i = 0; i < targetValue.length; i++) {
        await this.page.keyboard.type(targetValue[i]);
        await this.randomDelay(20, 50);
      }
      await this.randomDelay(500, 1000);

      // Step 3: Wait for listbox to appear
      const listboxAppeared = await this.waitForListboxInModal(modal, targetValue);
      
      if (!listboxAppeared) {
        // Retry: type one more character and check again
        logger.warn({ fieldName }, 'Listbox not visible, retrying with additional character...');
        await this.page.keyboard.type(targetValue.charAt(0));
        await this.randomDelay(150, 300);
        
        const retryListbox = await this.waitForListboxInModal(modal, targetValue);
        if (!retryListbox) {
          // No dropdown appeared, just continue to next field
          logger.info({ fieldName }, 'No dropdown appeared, continuing to next field');
          return { status: 'success', stage: 'create_profile', screenshots: this.screenshots, url: this.page.url(), fieldValue: targetValue };
        }
      }

      // Take screenshot after typeahead opens
      (this.screenshots as any)[`${fieldName}_typeahead`] = await this.takeScreenshot(`${fieldName}_typeahead`);

      // Step 4: ArrowDown to highlight first suggestion
      await this.page.keyboard.press('ArrowDown');
      await this.randomDelay(200, 400);

      // Step 5: Enter to accept
      await this.page.keyboard.press('Enter');
      await this.randomDelay(500, 1000);

      // Step 6: Verify and handle remaining listbox
      const listboxStillOpen = await this.checkListboxInModal(modal);
      if (listboxStillOpen) {
        // Press Enter again to commit
        await this.page.keyboard.press('Enter');
        await this.randomDelay(300, 600);
        
        const stillOpen = await this.checkListboxInModal(modal);
        if (stillOpen) {
          // Escape to close
          await this.page.keyboard.press('Escape');
          await this.randomDelay(200, 400);
        }
      }

      // Step 7: Verify field value (but be lenient)
      const fieldValue = await this.getFieldValue(inputField);
      if (fieldValue && fieldValue.trim() !== '') {
        logger.info({ fieldName, fieldValue }, 'Keyboard dropdown selection successful');
      } else {
        logger.info({ fieldName }, 'Field value verification failed, but proceeding since text was typed');
      }
      
      return { 
        status: 'success', 
        stage: 'create_profile', 
        screenshots: this.screenshots, 
        url: this.page.url(), 
        fieldValue: fieldValue || targetValue
      };

    } catch (error) {
      return {
        status: 'soft_fail',
        stage: 'create_profile',
        error_code: `${fieldName.toUpperCase()}_KEYBOARD_SELECTION_FAILED`,
        screenshots: this.screenshots,
        url: this.page.url(),
        evidence: error instanceof Error ? error.message : `Keyboard selection failed for ${fieldName}`,
      };
    }
  }

  private async waitForListboxInModal(modal: ElementHandle<Element>, targetValue: string): Promise<boolean> {
    try {
      await this.page.waitForFunction((modalEl: Element) => {
        // Check for listbox within modal
        const listbox = modalEl.querySelector('[role="listbox"]');
        if (listbox) return true;
        
        // Check for menu container with options
        const menuContainer = modalEl.querySelector('[role="menu"], .up-autocomplete, .dropdown-menu');
        if (menuContainer) {
          const options = menuContainer.querySelectorAll('[role="option"], li');
          if (options.length > 0) return true;
        }
        
        return false;
      }, { timeout: 2000 }, modal);
      
      return true;
    } catch (error) {
      return false;
    }
  }

  private async checkListboxInModal(modal: ElementHandle<Element>): Promise<boolean> {
    try {
      return await modal.evaluate((modalEl: Element) => {
        const listbox = modalEl.querySelector('[role="listbox"]');
        if (listbox) return true;
        
        const menuContainer = modalEl.querySelector('[role="menu"], .up-autocomplete, .dropdown-menu');
        if (menuContainer) {
          const options = menuContainer.querySelectorAll('[role="option"], li');
          if (options.length > 0) return true;
        }
        
        return false;
      });
    } catch (error) {
      return false;
    }
  }

  private async getFieldValue(inputField: ElementHandle<Element>): Promise<string> {
    try {
      return await inputField.evaluate((el: Element) => {
        const input = el as HTMLInputElement;
        return input.value || input.getAttribute('data-value') || input.textContent || '';
      });
    } catch (error) {
      return '';
    }
  }

  private async waitForDropdownToAppear(): Promise<boolean> {
    try {
      // Wait for dropdown to appear with multiple selector strategies
      await this.page.waitForFunction(() => {
        // Check for listbox role
        const listbox = document.querySelector('[role="listbox"]');
        if (listbox) return true;

        // Check for autocomplete dropdown
        const autocomplete = document.querySelector('.up-autocomplete, .dropdown-menu');
        if (autocomplete) return true;

        // Check for option elements
        const options = document.querySelectorAll('[role="option"], .up-autocomplete li, .dropdown-menu li');
        if (options.length > 0) return true;

        return false;
      }, { timeout: 5000 });

      return true;
    } catch (error) {
      return false;
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
