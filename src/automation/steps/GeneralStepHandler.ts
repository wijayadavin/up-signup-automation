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

export class GeneralStepHandler extends StepHandler {
  constructor(page: Page, user: User) {
    super(page, user, 'general');
  }

  async execute(options?: { skipOtp?: boolean }): Promise<AutomationResult> {
    try {
      logger.info('Handling general step...');
      
      // Validate current page
      const pageValidation = await this.validateCurrentPage('/nx/create-profile/general');
      if (pageValidation) {
        return pageValidation;
      }

      await this.waitForPageReady();
      this.screenshots.general_before = await this.takeScreenshot('general_before');

      // Wait longer for the page to fully load after redirection
      logger.info('Waiting for general page to fully load after redirection...');
      await this.randomDelay(5000, 8000);

      // Take screenshot after waiting
      this.screenshots.general_after = await this.takeScreenshot('general_after');

      // Look for the Next button with multiple retries and longer delays
      logger.info('Looking for Next button on general page...');
      
      let nextButton = null;
      const maxRetries = 3;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        logger.info(`Next button search attempt ${attempt}/${maxRetries}...`);
        
        nextButton = await this.waitForSelectorWithRetry([
          'button[data-qa="next-btn"]',
          'button[data-ev-label="next_btn"]',
          'button.air3-btn-primary:contains("Next")',
          'button:contains("Next")',
          '[role="button"]:contains("Next")',
          'a[role="button"]:contains("Next")',
          'button[type="submit"]:contains("Next")',
          'button.air3-btn:contains("Next")',
          'button[class*="btn"]:contains("Next")',
          'button:contains("Continue")',
          'button:contains("Skip")',
          '[role="button"][aria-label*="Next"]',
          '[role="button"][aria-label*="Skip"]',
          '[data-test="next-button"]'
        ], 15000); // 15 seconds timeout

        if (nextButton) {
          logger.info(`✅ Next button found on attempt ${attempt}`);
          break;
        }
        
        if (attempt < maxRetries) {
          logger.warn(`Next button not found on attempt ${attempt}, waiting 3-6 seconds before retry...`);
          await this.randomDelay(3000, 6000);
          
          // Also wait for page to be ready
          await this.waitForPageReady();
          
          // Check if we're still on the general page
          const currentUrl = this.page.url();
          if (!currentUrl.includes('/nx/create-profile/general')) {
            logger.warn(`Page URL changed during wait: ${currentUrl}`);
          }
        }
      }

      if (!nextButton) {
        logger.error(`Next button not found after ${maxRetries} attempts`);
        return this.createError('GENERAL_NEXT_NOT_FOUND', `Next button not found on general page after ${maxRetries} attempts`);
      }

      logger.info('Clicking Next button on general page...');
      await this.clickElement(nextButton);
      
      // Wait for navigation to complete
      logger.info('Waiting for navigation after Next button click...');
      await this.randomDelay(3000, 5000);
      
      // Wait for page to be ready
      await this.waitForPageReady();
      
      // Verify we moved to the next step
      const currentUrl = this.page.url();
      logger.info(`Current URL after Next button click: ${currentUrl}`);
      
      if (currentUrl.includes('/nx/create-profile/general')) {
        logger.error('Still on general page after Next button click');
        return this.createError('GENERAL_STEP_STUCK', 'Still on general page after Next button click');
      }
      
      logger.info('✅ General step completed successfully');
      return this.createSuccess();

    } catch (error) {
      return this.createError('GENERAL_STEP_FAILED', `General step failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
