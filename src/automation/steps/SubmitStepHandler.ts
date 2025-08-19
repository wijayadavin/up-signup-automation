import { Page } from 'puppeteer';
import { User } from '../../types/database';
import { StepHandler } from '../StepHandler';
import { AutomationResult } from '../BaseAutomation';

// Create a simple logger for automation
const logger = {
  info: (message: string, ...args: any[]) => console.log(`[INFO] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[WARN] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[ERROR] ${message}`, ...args),
  debug: (message: string, ...args: any[]) => console.debug(`[DEBUG] ${message}`, ...args),
};

export class SubmitStepHandler extends StepHandler {
  constructor(page: Page, user: User) {
    super(page, user, 'submit');
  }

  async execute(): Promise<AutomationResult> {
    try {
      logger.info('Handling submit step...');
      
      // Wait for OTP verification to complete and redirect to submit page
      const redirectResult = await this.waitForSubmitPageRedirect();
      if (redirectResult.status !== 'success') {
        return redirectResult;
      }

      // Take screenshot before submission
      this.screenshots.submit_before = await this.takeScreenshot('submit_before');

      // Click the submit profile button
      const submitResult = await this.clickSubmitButton();
      if (submitResult.status !== 'success') {
        return submitResult;
      }

      // Wait for redirect to finish page
      const finishResult = await this.waitForFinishPageRedirect();
      if (finishResult.status !== 'success') {
        return finishResult;
      }

      // Take screenshot after successful submission
      this.screenshots.submit_after = await this.takeScreenshot('submit_after');

      // Mark user as successful once we reach the finish page
      try {
        await this.markUserAsSuccessful();
        logger.info('Submit step completed successfully - user marked as successful');
        return this.createSuccess();
      } catch (error) {
        logger.error('Failed to mark user as successful:', error);
        return this.createError('SUCCESS_MARKING_FAILED', `Failed to mark user as successful: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

    } catch (error) {
      return this.createError('SUBMIT_STEP_FAILED', `Submit step failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async waitForSubmitPageRedirect(): Promise<AutomationResult> {
    try {
      logger.info('Waiting for redirect to submit page after OTP verification...');
      
      // Wait a bit for OTP verification to complete
      await this.randomDelay(3000, 5000);
      
      // Check if we're already on the submit page
      const currentUrl = this.page.url();
      if (currentUrl.includes('/nx/create-profile/submit')) {
        logger.info('Already on submit page');
        return this.createSuccess();
      }

      // Wait for redirect to submit page with retries
      let attempts = 0;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts) {
        attempts++;
        logger.info(`Submit page redirect attempt ${attempts}/${maxAttempts}`);
        
        try {
          // Wait for navigation to submit page
          await this.page.waitForFunction(
            (url) => url.includes('/nx/create-profile/submit'),
            { timeout: 10000 },
            this.page.url()
          );
          
          // Wait for page to be fully loaded
          await this.randomDelay(2000, 3000);
          
          const finalUrl = this.page.url();
          if (finalUrl.includes('/nx/create-profile/submit')) {
            logger.info(`✅ Successfully redirected to submit page: ${finalUrl}`);
            return this.createSuccess();
          }
          
        } catch (error) {
          logger.warn(`Submit page redirect attempt ${attempts} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          
          if (attempts < maxAttempts) {
            logger.info(`Retrying submit page redirect in 3 seconds...`);
            await this.randomDelay(3000, 3000);
          }
        }
      }
      
      // Check current URL one more time
      const currentUrlAfterAttempts = this.page.url();
      if (currentUrlAfterAttempts.includes('/nx/create-profile/submit')) {
        logger.info(`✅ Found submit page on final check: ${currentUrlAfterAttempts}`);
        return this.createSuccess();
      }
      
      logger.error(`Failed to redirect to submit page after ${maxAttempts} attempts. Current URL: ${currentUrlAfterAttempts}`);
      return this.createError('SUBMIT_PAGE_REDIRECT_FAILED', `Failed to redirect to submit page after ${maxAttempts} attempts. Current URL: ${currentUrlAfterAttempts}`);
      
    } catch (error) {
      return this.createError('SUBMIT_PAGE_REDIRECT_ERROR', `Submit page redirect error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async clickSubmitButton(): Promise<AutomationResult> {
    try {
      logger.info('Looking for submit profile button...');
      
      // Wait for the submit button to appear
      const submitButton = await this.waitForSelectorWithRetry([
        'button[data-qa="submit-profile-top-btn"]',
        'button[data-ev-label="submit_profile_top_btn"]',
        '.submit-profile-top-btn',
        'button:contains("Submit profile")',
        '.air3-btn-primary:contains("Submit profile")'
      ], 10000);

      if (!submitButton) {
        return this.createError('SUBMIT_BUTTON_NOT_FOUND', 'Submit profile button not found on submit page');
      }

      logger.info('Found submit profile button, clicking...');
      
      // Click the submit button
      await this.clickElement(submitButton);
      
      // Wait for the button click to be processed
      await this.randomDelay(2000, 3000);
      
      logger.info('Submit profile button clicked successfully');
      return this.createSuccess();

    } catch (error) {
      return this.createError('SUBMIT_BUTTON_CLICK_FAILED', `Failed to click submit button: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async waitForFinishPageRedirect(): Promise<AutomationResult> {
    try {
      logger.info('Waiting for redirect to finish page after profile submission...');
      
      // Wait for redirect to finish page with retries
      let attempts = 0;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts) {
        attempts++;
        logger.info(`Finish page redirect attempt ${attempts}/${maxAttempts}`);
        
        try {
          // Wait for navigation to finish page
          await this.page.waitForFunction(
            (url) => url.includes('/nx/create-profile/finish'),
            { timeout: 15000 },
            this.page.url()
          );
          
          // Wait for page to be fully loaded
          await this.randomDelay(3000, 5000);
          
          const finalUrl = this.page.url();
          if (finalUrl.includes('/nx/create-profile/finish')) {
            logger.info(`✅ Successfully redirected to finish page: ${finalUrl}`);
            return this.createSuccess();
          }
          
        } catch (error) {
          logger.warn(`Finish page redirect attempt ${attempts} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          
          if (attempts < maxAttempts) {
            logger.info(`Retrying finish page redirect in 5 seconds...`);
            await this.randomDelay(5000, 5000);
          }
        }
      }
      
      // Check current URL one more time
      const currentUrlAfterAttempts = this.page.url();
      if (currentUrlAfterAttempts.includes('/nx/create-profile/finish')) {
        logger.info(`✅ Found finish page on final check: ${currentUrlAfterAttempts}`);
        return this.createSuccess();
      }
      
      logger.error(`Failed to redirect to finish page after ${maxAttempts} attempts. Current URL: ${currentUrlAfterAttempts}`);
      return this.createError('FINISH_PAGE_REDIRECT_FAILED', `Failed to redirect to finish page after ${maxAttempts} attempts. Current URL: ${currentUrlAfterAttempts}`);
      
    } catch (error) {
      return this.createError('FINISH_PAGE_REDIRECT_ERROR', `Finish page redirect error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async markUserAsSuccessful(): Promise<void> {
    try {
      // Use UserService for centralized validation and success marking
      const { UserService } = await import('../../services/userService.js');
      const userService = new UserService();
      
      await userService.markUserAsSuccessful(this.user.id, this.user);
      
      logger.info(`✅ Marked user ${this.user.id} as successful at ${new Date().toISOString()}`);
    } catch (error) {
      logger.error('Failed to mark user as successful:', error);
      throw error; // Re-throw to prevent false success
    }
  }
}
