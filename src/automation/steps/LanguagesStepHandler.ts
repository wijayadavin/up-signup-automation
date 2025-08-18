import { StepHandler } from '../StepHandler.js';
import { AutomationResult } from '../BaseAutomation.js';

const logger = {
  info: (message: string, ...args: any[]) => console.log(`[INFO] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[WARN] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[ERROR] ${message}`, ...args),
  debug: (message: string, ...args: any[]) => console.log(`[DEBUG] ${message}`, ...args),
};

export class LanguagesStepHandler extends StepHandler {
  constructor(page: any, user: any) {
    super(page, user, 'languages');
  }

  async execute(options?: { uploadOnly?: boolean; skipOtp?: boolean; skipLocation?: boolean }): Promise<AutomationResult> {
    try {
      logger.info('Handling languages step...');

      // Assert current route
      const currentUrl = this.page.url();
      if (!currentUrl.includes('/nx/create-profile/languages')) {
        return this.createError(
          'LANGUAGES_PAGE_NOT_FOUND',
          `Expected languages page, got ${currentUrl}`
        );
      }

      await this.waitForPageReady();
      this.screenshots.languages_before = await this.takeScreenshot('languages_before');

      // Find the English proficiency dropdown
      const proficiencyDropdown = await this.waitForSelectorWithRetry([
        '[data-ev-label="dropdown_toggle"][data-test="dropdown-toggle"]',
        '[role="combobox"][aria-labelledby*="dropdown-label-english"]',
        '[data-test="dropdown-toggle"]',
      ], 15000);

      if (!proficiencyDropdown) {
        return this.createError(
          'PROFICIENCY_DROPDOWN_NOT_FOUND',
          'English proficiency dropdown not found'
        );
      }

      // Click the dropdown to open it
      await proficiencyDropdown.click();
      logger.info('Clicked English proficiency dropdown');
      await this.randomDelay(300, 600);

      // Reuse combobox helper to select first option (ArrowDown + Enter)
      await this.handleComboboxSelection();
      await this.randomDelay(300, 600);

      // Additional safety: if still open, try one more ArrowDown + Enter
      try {
        const expanded = await this.page.evaluate(() => {
          const trigger = document.querySelector('[data-test="dropdown-toggle"], [role="combobox"]');
          return trigger && (trigger as HTMLElement).getAttribute('aria-expanded') === 'true';
        });
        if (expanded) {
          logger.info('Dropdown still expanded, attempting selection again');
          await this.handleComboboxSelection();
        }
      } catch {}

      // Find and click the Next button
      const nextButton = await this.waitForSelectorWithRetry([
        'button[data-test="next-button"][data-ev-label="wizard_next"]',
        'button:contains("Next, write an overview")',
        '[data-test="next-button"]',
        'button:contains("Next")',
      ], 15000);

      if (!nextButton) {
        return this.createError(
          'LANGUAGES_NEXT_NOT_FOUND',
          'Next button not found on languages page'
        );
      }

      this.screenshots.languages_after = await this.takeScreenshot('languages_after');
      const beforeUrl = this.page.url();
      await nextButton.click();
      await this.randomDelay(700, 1000);

      // Prefer SPA transition detection over waitForNavigation
      await this.waitForPageTransition();
      const afterUrl = this.page.url();
      if (afterUrl.includes('/nx/create-profile/languages')) {
        return this.createError(
          'LANGUAGES_STEP_STUCK',
          'URL did not change after clicking Next on languages step'
        );
      }

      logger.info('Languages step completed successfully');
      return this.createSuccess();

    } catch (error) {
      return this.createError(
        'LANGUAGES_STEP_FAILED',
        `Languages step failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Selects the first option in an open combobox via keyboard
  private async handleComboboxSelection(): Promise<void> {
    try {
      await this.page.keyboard.press('ArrowDown');
      await this.randomDelay(200, 300);
      await this.page.keyboard.press('Enter');
      await this.randomDelay(300, 500);
      logger.info('Attempted combobox selection with ArrowDown + Enter');
    } catch (error) {
      logger.warn('Combobox selection attempt failed', error);
    }
  }
}
