import { StepHandler } from '../StepHandler.js';
import { AutomationResult } from '../BaseAutomation.js';

const logger = {
  info: (message: string, ...args: any[]) => console.log(`[INFO] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[WARN] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[ERROR] ${message}`, ...args),
  debug: (message: string, ...args: any[]) => console.log(`[DEBUG] ${message}`, ...args),
};

export class RateStepHandler extends StepHandler {
  constructor(page: any, user: any) {
    super(page, user, 'rate');
  }

  async execute(options?: { uploadOnly?: boolean; skipOtp?: boolean; skipLocation?: boolean }): Promise<AutomationResult> {
    try {
      logger.info('Handling rate step...');

      // Assert current route
      const currentUrl = this.page.url();
      if (!currentUrl.includes('/nx/create-profile/rate')) {
        return this.createError(
          'RATE_PAGE_NOT_FOUND',
          `Expected rate page, got ${currentUrl}`
        );
      }

      await this.waitForPageReady();
      this.screenshots.rate_before = await this.takeScreenshot('rate_before');

      // Find the hourly rate input field
      const rateInput = await this.waitForSelectorWithRetry([
        'input[data-test="currency-input"][data-ev-label="currency_input"]',
        'input[aria-describedby*="currency-hourly"]',
        'input[data-test="currency-input"]',
        'input[placeholder="$0.00"]',
        'input[type="text"]',
      ], 15000);

      if (!rateInput) {
        return this.createError(
          'RATE_INPUT_NOT_FOUND',
          'Hourly rate input field not found'
        );
      }

      // Generate random rate between 10-20
      const randomRate = Math.floor(Math.random() * (20 - 10 + 1)) + 10;
      const rateText = randomRate.toString();

      // Clear and type the rate
      await this.clearAndType(rateInput, rateText);

      logger.info(`Set hourly rate to $${randomRate}`);

      // Look for "Next" or "Continue" button
      const nextButton = await this.waitForSelectorWithRetry([
        '[role="button"][aria-label*="Next"]',
        '[role="button"][aria-label*="Continue"]',
        '[data-test="next-button"]',
        'button:contains("Next")',
        'button:contains("Continue")',
      ], 15000);

      if (!nextButton) {
        return this.createError(
          'RATE_NEXT_NOT_FOUND',
          'Next button not found on rate page'
        );
      }

      this.screenshots.rate_after = await this.takeScreenshot('rate_after');
      await nextButton.click();
      await this.randomDelay(700, 1000);

      // Wait for navigation to next step
      try {
        await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
      } catch (error) {
        // Check if we're already on the next page
        const newUrl = this.page.url();
        if (!newUrl.includes('/nx/create-profile/')) {
          return this.createError(
            'RATE_NAVIGATION_FAILED',
            'Failed to navigate from rate page'
          );
        }
      }

      logger.info('Rate step completed successfully');
      return this.createSuccess();

    } catch (error) {
      return this.createError(
        'RATE_STEP_FAILED',
        `Rate step failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
