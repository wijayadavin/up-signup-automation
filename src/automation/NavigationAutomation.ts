import { BaseAutomation, AutomationResult } from './BaseAutomation';

// Create a simple logger for automation
const logger = {
  info: (message: string, ...args: any[]) => console.log(`[INFO] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[WARN] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[ERROR] ${message}`, ...args),
  debug: (message: string, ...args: any[]) => console.debug(`[DEBUG] ${message}`, ...args),
};

export class NavigationAutomation extends BaseAutomation {
  
  // Standard next button selectors
  private readonly NEXT_BUTTON_SELECTORS = [
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
    '[data-test="next-button"]',
  ];

  // Try to find and click next button
  async clickNextButton(stepName: string): Promise<AutomationResult> {
    const nextButton = await this.waitForSelectorWithRetry(this.NEXT_BUTTON_SELECTORS, 10000);
    
    if (!nextButton) {
      return this.createError(
        `${stepName.toUpperCase()}_NEXT_NOT_FOUND`,
        `Next button not found on ${stepName} page`
      );
    }

    logger.info(`Found Next button on ${stepName} page, clicking it...`);
    await this.clickElement(nextButton);
    await this.randomDelay(2000, 4000);
    
    // Wait for navigation
    await this.waitForNavigation();
    
    // Verify we navigated
    const newUrl = this.page.url();
    if (!newUrl.includes('/nx/create-profile/')) {
      return this.createError(
        `${stepName.toUpperCase()}_NAVIGATION_FAILED`,
        `Failed to navigate from ${stepName} page`
      );
    }
    
    logger.info(`${stepName} step completed successfully with Next button`);
    return this.createSuccess();
  }

  // Navigate to specific URL
  async navigateToUrl(url: string, stepName: string): Promise<AutomationResult> {
    try {
      logger.info(`Navigating to ${url} for ${stepName} step`);
      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      
      await this.waitForPageReady();
      
      logger.info(`Successfully navigated to ${stepName} page`);
      return this.createSuccess();
    } catch (error) {
      return this.createError(
        `${stepName.toUpperCase()}_NAVIGATION_FAILED`,
        `Failed to navigate to ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Wait for page to match URL pattern
  async waitForUrlPattern(pattern: string, timeout: number = 15000): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const currentUrl = this.page.url();
      if (currentUrl.includes(pattern)) {
        return true;
      }
      await this.randomDelay(500, 1000);
    }
    
    return false;
  }

  // Get the next step URL based on current URL
  getNextStepUrl(currentUrl: string): string | null {
    const urlSequence = [
      '/nx/create-profile/experience',
      '/nx/create-profile/goal', 
      '/nx/create-profile/work-preference',
      '/nx/create-profile/resume-import',
      '/nx/create-profile/categories',
      '/nx/create-profile/skills',
      '/nx/create-profile/title',
      '/nx/create-profile/employment',
      '/nx/create-profile/education',
      '/nx/create-profile/languages',
      '/nx/create-profile/location'
    ];

    const currentStep = urlSequence.find(step => currentUrl.includes(step));
    if (!currentStep) {
      return null;
    }

    const currentIndex = urlSequence.indexOf(currentStep);
    const nextIndex = currentIndex + 1;
    
    if (nextIndex >= urlSequence.length) {
      return null;
    }

    const baseUrl = currentUrl.split('/nx/create-profile')[0];
    return `${baseUrl}${urlSequence[nextIndex]}`;
  }

  // Handle fallback navigation when Next button is missing
  async handleFallbackNavigation(currentUrl: string, stepName: string): Promise<AutomationResult> {
    const nextUrl = this.getNextStepUrl(currentUrl);
    
    if (!nextUrl) {
      return this.createError(
        `${stepName.toUpperCase()}_NO_NEXT_URL`,
        `No next URL found for ${stepName} step`
      );
    }

    logger.info(`Next button not found, navigating directly to: ${nextUrl}`);
    return await this.navigateToUrl(nextUrl, stepName);
  }

  // Click edit button (for existing entries)
  async clickEditButton(stepName: string): Promise<AutomationResult> {
    const editButton = await this.waitForSelectorWithRetry([
      'button[data-qa="edit-item"]',
      'button[data-ev-label="edit_item"]',
      'button[aria-label="Edit"]',
      '.air3-btn-circle[aria-label="Edit"]',
      'button:contains("Edit")',
    ], 10000);

    if (!editButton) {
      return this.createError(
        `${stepName.toUpperCase()}_EDIT_NOT_FOUND`,
        `Edit button not found on ${stepName} page`
      );
    }

    logger.info(`Found Edit button on ${stepName} page, clicking it...`);
    await this.clickElement(editButton);
    await this.randomDelay(2000, 3000);
    
    return this.createSuccess();
  }

  // Click add button (for new entries)
  async clickAddButton(stepName: string, buttonText: string = 'Add'): Promise<AutomationResult> {
    const addButton = await this.waitForSelectorWithRetry([
      `button[data-qa="${stepName}-add-btn"]`,
      `button[data-ev-label="${stepName}_add_btn"]`,
      `button[aria-labelledby="add-${stepName}-label"]`,
      'a[data-ev-label="add_more_link"] button',
      '.carousel-list-add-new button',
      `button:contains("${buttonText} ${stepName}")`,
      `button:contains("${buttonText} ${stepName.charAt(0).toUpperCase() + stepName.slice(1)}")`,
    ], 15000);

    if (!addButton) {
      return this.createError(
        `${stepName.toUpperCase()}_ADD_NOT_FOUND`,
        `Add ${stepName} button not found`
      );
    }

    logger.info(`Found Add ${stepName} button, clicking it...`);
    await this.clickElement(addButton);
    await this.randomDelay(2000, 3000);
    
    return this.createSuccess();
  }

  // Save button click (for modals)
  async clickSaveButton(stepName: string): Promise<AutomationResult> {
    const saveButton = await this.waitForSelectorWithRetry([
      'button[data-qa="btn-save"]',
      'button[data-ev-label="btn_save"]',
      'button.air3-btn.air3-btn-primary:contains("Save")',
      'button:contains("Save")',
      '[role="button"]:contains("Save")',
    ], 10000);

    if (!saveButton) {
      return this.createError(
        `${stepName.toUpperCase()}_SAVE_NOT_FOUND`,
        `Save button not found in ${stepName} modal`
      );
    }

    logger.info(`Clicking Save button in ${stepName} modal...`);
    await this.clickElement(saveButton);
    await this.randomDelay(2000, 3000);
    
    return this.createSuccess();
  }

  // Verify modal is closed
  async verifyModalClosed(stepName: string): Promise<AutomationResult> {
    const modalStillOpen = await this.page.$('[role="dialog"]');
    if (modalStillOpen) {
      return this.createError(
        `${stepName.toUpperCase()}_MODAL_NOT_CLOSED`,
        `${stepName} modal did not close after saving`
      );
    }
    
    logger.info(`${stepName} modal closed successfully`);
    return this.createSuccess();
  }
}
