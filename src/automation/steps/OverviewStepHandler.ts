import { StepHandler } from '../StepHandler.js';
import { AutomationResult } from '../BaseAutomation.js';

const logger = {
  info: (message: string, ...args: any[]) => console.log(`[INFO] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[WARN] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[ERROR] ${message}`, ...args),
  debug: (message: string, ...args: any[]) => console.log(`[DEBUG] ${message}`, ...args),
};

export class OverviewStepHandler extends StepHandler {
  constructor(page: any, user: any) {
    super(page, user, 'overview');
  }

  async execute(options?: { uploadOnly?: boolean; skipOtp?: boolean; skipLocation?: boolean }): Promise<AutomationResult> {
    try {
      logger.info('Handling overview step...');

      // Assert current route
      const currentUrl = this.page.url();
      if (!currentUrl.includes('/nx/create-profile/overview')) {
        return this.createError(
          'OVERVIEW_PAGE_NOT_FOUND',
          `Expected overview page, got ${currentUrl}`
        );
      }

      await this.waitForPageReady();
      this.screenshots.overview_before = await this.takeScreenshot('overview_before');

      // Find the overview textarea
      const overviewTextarea = await this.waitForSelectorWithRetry([
        'textarea[aria-labelledby="overview-label"]',
        'textarea[aria-describedby="overview-counter"]',
        'textarea.air3-textarea',
        'textarea[placeholder*="Enter your top skills"]',
        'textarea',
      ], 15000);

      if (!overviewTextarea) {
        return this.createError(
          'OVERVIEW_TEXTAREA_NOT_FOUND',
          'Overview textarea not found'
        );
      }

      // Lorem ipsum text with at least 100 characters
      const overviewText = `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.`;

      // Clear and paste the overview text
      await this.clearAndPaste(overviewTextarea, overviewText);

      logger.info('Filled overview textarea with lorem ipsum text');

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
          'OVERVIEW_NEXT_NOT_FOUND',
          'Next button not found on overview page'
        );
      }

      this.screenshots.overview_after = await this.takeScreenshot('overview_after');
      await nextButton.click();
      await this.randomDelay(300, 600);

      // Prefer SPA transition detection over waitForNavigation
      await this.waitForPageTransition();
      const afterUrl = this.page.url();
      if (afterUrl.includes('/nx/create-profile/overview')) {
        return this.createError(
          'OVERVIEW_STEP_STUCK',
          'URL did not change after clicking Next on overview step'
        );
      }

      logger.info('Overview step completed successfully');
      return this.createSuccess();

    } catch (error) {
      return this.createError(
        'OVERVIEW_STEP_FAILED',
        `Overview step failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Clear field and paste text using clipboard
  private async clearAndPaste(element: any, text: string): Promise<void> {
    try {
      // Focus the element
      await element.click();
      await this.randomDelay(100, 200);

      // Clear existing content (Ctrl+A, Backspace)
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('KeyA');
      await this.page.keyboard.up('Control');
      await this.randomDelay(100, 200);
      await this.page.keyboard.press('Backspace');
      await this.randomDelay(100, 200);

      // Copy text to clipboard and paste
      await this.page.evaluate((textToPaste) => {
        navigator.clipboard.writeText(textToPaste);
      }, text);
      await this.randomDelay(100, 200);

      // Paste using Ctrl+V
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('KeyV');
      await this.page.keyboard.up('Control');
      await this.randomDelay(200, 400);

      logger.info('Successfully pasted text using clipboard');
    } catch (error) {
      logger.warn('Clipboard paste failed, falling back to typing', error);
      // Fallback to typing if clipboard fails
      await this.clearAndType(element, text);
    }
  }
}
