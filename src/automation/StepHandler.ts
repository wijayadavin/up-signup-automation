import { Page } from 'puppeteer';
import { User } from '../types/database';
import { BaseAutomation, AutomationResult } from './BaseAutomation';
import { FormAutomation } from './FormAutomation';
import { NavigationAutomation } from './NavigationAutomation';

// Create a simple logger for automation
const logger = {
  info: (message: string, ...args: any[]) => console.log(`[INFO] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[WARN] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[ERROR] ${message}`, ...args),
  debug: (message: string, ...args: any[]) => console.debug(`[DEBUG] ${message}`, ...args),
};

export abstract class StepHandler extends BaseAutomation {
  protected formAutomation: FormAutomation;
  protected navigationAutomation: NavigationAutomation;
  protected stepName: string;

  constructor(page: Page, user: User, stepName: string) {
    super(page, user);
    this.formAutomation = new FormAutomation(page, user);
    this.navigationAutomation = new NavigationAutomation(page, user);
    this.stepName = stepName;
  }

  // Abstract method that each step must implement
  abstract execute(options?: { uploadOnly?: boolean; skipOtp?: boolean; skipLocation?: boolean }): Promise<AutomationResult>;

  // Common step validation
  protected async validateCurrentPage(expectedUrl: string): Promise<AutomationResult | null> {
    const currentUrl = this.page.url();
    if (!currentUrl.includes(expectedUrl)) {
      return this.createError(
        `${this.stepName.toUpperCase()}_PAGE_NOT_FOUND`,
        `Expected ${this.stepName} page, got ${currentUrl}`
      );
    }
    return null;
  }

  // Try next button first approach (for --upload scenarios)
  protected async tryNextButtonFirst(): Promise<AutomationResult | null> {
    logger.info(`Trying Next button first for ${this.stepName} step...`);
    
    const result = await this.navigationAutomation.clickNextButton(this.stepName);
    if (result.status === 'success') {
      return result;
    }
    
    // Next button not found, proceed with form filling
    logger.info(`Next button not found for ${this.stepName}, proceeding with form filling...`);
    return null;
  }

  // Step execution pattern for upload scenarios (tries Next button first)
  protected async executeUploadStepPattern(
    expectedUrl: string,
    formFillingFunction: () => Promise<AutomationResult>
  ): Promise<AutomationResult> {
    try {
      logger.info(`Handling ${this.stepName} step (upload mode)...`);

      // Validate current page
      const pageValidation = await this.validateCurrentPage(expectedUrl);
      if (pageValidation) {
        return pageValidation;
      }

      await this.waitForPageReady();
      this.screenshots[`${this.stepName}_before`] = await this.takeScreenshot(`${this.stepName}_before`);

      // Try Next button first (for upload scenarios)
      const nextResult = await this.tryNextButtonFirst();
      if (nextResult) {
        this.screenshots[`${this.stepName}_after`] = await this.takeScreenshot(`${this.stepName}_after`);
        return nextResult;
      }

      // Try Edit button (for existing entries)
      const editResult = await this.tryEditButton();
      if (editResult) {
        // Edit modal opened, handle it and then try Next button again
        const formResult = await formFillingFunction();
        if (formResult.status !== 'success') {
          return formResult;
        }

        // Try Next button after editing
        const nextAfterEdit = await this.navigationAutomation.clickNextButton(this.stepName);
        this.screenshots[`${this.stepName}_after`] = await this.takeScreenshot(`${this.stepName}_after`);
        return nextAfterEdit;
      }

      // Fallback to form filling
      logger.info(`No Next or Edit button found, proceeding with ${this.stepName} form filling...`);
      const formResult = await formFillingFunction();
      if (formResult.status !== 'success') {
        return formResult;
      }

      // Click Next button after form filling
      const finalNextResult = await this.navigationAutomation.clickNextButton(this.stepName);
      this.screenshots[`${this.stepName}_after`] = await this.takeScreenshot(`${this.stepName}_after`);
      return finalNextResult;

    } catch (error) {
      return this.createError(
        `${this.stepName.toUpperCase()}_STEP_FAILED`,
        `${this.stepName} step failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Check for edit button (for existing entries)
  protected async tryEditButton(): Promise<AutomationResult | null> {
    logger.info(`Checking for Edit button on ${this.stepName} page...`);
    
    const result = await this.navigationAutomation.clickEditButton(this.stepName);
    if (result.status === 'success') {
      return result;
    }
    
    // Edit button not found
    logger.info(`Edit button not found for ${this.stepName}`);
    return null;
  }

  // Standard step execution pattern
  protected async executeStepPattern(
    expectedUrl: string,
    formFillingFunction: () => Promise<AutomationResult>
  ): Promise<AutomationResult> {
    try {
      logger.info(`Handling ${this.stepName} step...`);

      // Validate current page
      const pageValidation = await this.validateCurrentPage(expectedUrl);
      if (pageValidation) {
        return pageValidation;
      }

      await this.waitForPageReady();
      this.screenshots[`${this.stepName}_before`] = await this.takeScreenshot(`${this.stepName}_before`);

      // Try Edit button (for existing entries)
      const editResult = await this.tryEditButton();
      if (editResult) {
        // Edit modal opened, handle it and then try Next button again
        const formResult = await formFillingFunction();
        if (formResult.status !== 'success') {
          return formResult;
        }

        // Try Next button after editing
        const nextAfterEdit = await this.navigationAutomation.clickNextButton(this.stepName);
        this.screenshots[`${this.stepName}_after`] = await this.takeScreenshot(`${this.stepName}_after`);
        return nextAfterEdit;
      }

      // Proceed with form filling
      logger.info(`Proceeding with ${this.stepName} form filling...`);
      const formResult = await formFillingFunction();
      if (formResult.status !== 'success') {
        return formResult;
      }

      // Click Next button after form filling
      const finalNextResult = await this.navigationAutomation.clickNextButton(this.stepName);
      this.screenshots[`${this.stepName}_after`] = await this.takeScreenshot(`${this.stepName}_after`);
      return finalNextResult;

    } catch (error) {
      return this.createError(
        `${this.stepName.toUpperCase()}_STEP_FAILED`,
        `${this.stepName} step failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Simple step that just tries Next button (for auto-filled steps)
  protected async executeSimpleStep(expectedUrl: string): Promise<AutomationResult> {
    try {
      logger.info(`Handling ${this.stepName} step (simple)...`);

      // Validate current page
      const pageValidation = await this.validateCurrentPage(expectedUrl);
      if (pageValidation) {
        return pageValidation;
      }

      await this.waitForPageReady();
      this.screenshots[`${this.stepName}_before`] = await this.takeScreenshot(`${this.stepName}_before`);

      // Try Next button
      const result = await this.navigationAutomation.clickNextButton(this.stepName);
      this.screenshots[`${this.stepName}_after`] = await this.takeScreenshot(`${this.stepName}_after`);
      
      return result;

    } catch (error) {
      return this.createError(
        `${this.stepName.toUpperCase()}_STEP_FAILED`,
        `${this.stepName} step failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
