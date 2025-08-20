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
      
      // Wait for page to be ready
      await this.waitForPageReady();
      this.screenshots.general_before = await this.takeScreenshot('general_before');

      // Wait for the page to fully load after redirection
      logger.info('Waiting for general page to fully load after redirection...');
      await this.randomDelay(5000, 8000);

      // Take screenshot after waiting
      this.screenshots.general_after = await this.takeScreenshot('general_after');

      // Check current URL to see where we actually are
      const currentUrl = this.page.url();
      logger.info(`Current URL after waiting: ${currentUrl}`);

      // If we're no longer on the general page, detect the current step and handle it
      if (!currentUrl.includes('/nx/create-profile/general')) {
        logger.info('No longer on general page, detecting current step...');
        
        // Detect the current step from URL
        let currentStep = 'unknown';
        if (currentUrl.includes('/resume-import')) currentStep = 'resume_import';
        else if (currentUrl.includes('/categories')) currentStep = 'categories';
        else if (currentUrl.includes('/skills')) currentStep = 'skills';
        else if (currentUrl.includes('/title')) currentStep = 'title';
        else if (currentUrl.includes('/employment')) currentStep = 'employment';
        else if (currentUrl.includes('/education')) currentStep = 'education';
        else if (currentUrl.includes('/languages')) currentStep = 'languages';
        else if (currentUrl.includes('/overview')) currentStep = 'overview';
        else if (currentUrl.includes('/rate')) currentStep = 'rate';
        else if (currentUrl.includes('/location')) currentStep = 'location';
        else if (currentUrl.includes('/submit')) currentStep = 'submit';
        
        logger.info(`Detected current step: ${currentStep}`);
        
        // If we detected a valid step, return success (the main automation will handle the step)
        if (currentStep !== 'unknown') {
          logger.info(`✅ General step completed - redirected to ${currentStep} step`);
          return this.createSuccess();
        } else {
          logger.warn(`Unknown step detected from URL: ${currentUrl}`);
          return this.createSuccess(); // Still return success to let main automation handle it
        }
      }

      // If we're still on the general page, it means the page didn't redirect
      // This could mean the general step is auto-filled or doesn't require action
      logger.info('Still on general page - general step appears to be auto-filled or complete');
      logger.info('✅ General step completed successfully');
      return this.createSuccess();

    } catch (error) {
      return this.createError('GENERAL_STEP_FAILED', `General step failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
