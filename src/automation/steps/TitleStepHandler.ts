import { StepHandler } from '../StepHandler.js';
import { AutomationResult } from '../BaseAutomation.js';
import { ElementHandle } from 'puppeteer';

const logger = {
  info: (message: string, ...args: any[]) => console.log(`[INFO] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[WARN] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[ERROR] ${message}`, ...args),
  debug: (message: string, ...args: any[]) => console.log(`[DEBUG] ${message}`, ...args),
};

export class TitleStepHandler extends StepHandler {
  constructor(page: any, user: any) {
    super(page, user, 'title');
  }

  async execute(options?: { uploadOnly?: boolean; skipOtp?: boolean; skipLocation?: boolean }): Promise<AutomationResult> {
    try {
      logger.info('Handling title step...');

      // Validate current page
      const pageValidation = await this.validateCurrentPage('/nx/create-profile/title');
      if (pageValidation) {
        return pageValidation;
      }

      await this.waitForPageReady();
      this.screenshots.title_before = await this.takeScreenshot('title_before');

      // Step 1: Find and fill the title input field
      logger.info('Looking for title input field...');
      const titleResult = await this.fillTitleField();
      if (titleResult.status !== 'success') {
        return titleResult;
      }

      // Step 2: Click Next button
      const navigationResult = await this.navigationAutomation.clickNextButton(this.stepName);
      this.screenshots.title_after = await this.takeScreenshot('title_after');
      return navigationResult;

    } catch (error) {
      return this.createError(
        'TITLE_STEP_FAILED',
        `Title step failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async fillTitleField(): Promise<AutomationResult> {
    try {
      logger.info('Attempting to fill title field...');

      // Get the job title to enter
      const jobTitle = this.getJobTitle();
      logger.info(`Job title to enter: "${jobTitle}"`);

      // Multiple strategies to find the title input field
      const titleInputSelectors = [
        // Primary: Target by aria-labelledby attribute
        'input[aria-labelledby="title-label"]',
        
        // Alternative: Target by placeholder text
        'input[placeholder*="Example"]',
        
        // Alternative: Target by type and aria-label
        'input[type="text"][aria-label*="title"]',
        
        // Alternative: Target by type and placeholder
        'input[type="text"][placeholder*="title"]',
        
        // Alternative: Target by class
        'input.air3-input[type="text"]',
        
        // Alternative: Target by role
        'input[role="textbox"][type="text"]',
        
        // Fallback: any text input in the form
        'input[type="text"]'
      ];

      // Use the robust fillField method from FormAutomation
      const fillResult = await this.formAutomation.fillField(titleInputSelectors, jobTitle, 'title');
      
      if (fillResult.status === 'success') {
        logger.info('Title field filled successfully using FormAutomation.fillField');
        return fillResult;
      }

      // If FormAutomation.fillField failed, try manual approach with verification
      logger.warn('FormAutomation.fillField failed, trying manual approach...');
      
      const titleInput = await this.waitForSelectorWithRetry(titleInputSelectors, 10000);
      if (!titleInput) {
        return this.createError('TITLE_INPUT_NOT_FOUND', 'Title input field not found after 10 seconds');
      }

      // Try manual typing with verification
      const typingResult = await this.typeWithVerification(titleInput, jobTitle, 'title');
      if (typingResult) {
        logger.info('Title field filled successfully using manual typing with verification');
        return this.createSuccess();
      }

      // Final fallback: try JavaScript set value
      logger.warn('Manual typing failed, trying JavaScript set value...');
      await titleInput.evaluate((el: Element, value: string) => {
        const input = el as HTMLInputElement;
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, jobTitle);
      
      await this.randomDelay(1000, 2000);
      
      // Verify the final result
      const finalValue = await titleInput.evaluate((el: Element) => (el as HTMLInputElement).value);
      if (finalValue === jobTitle) {
        logger.info(`✅ Title entered successfully via JavaScript: "${finalValue}"`);
        return this.createSuccess();
      } else {
        logger.warn(`⚠️ Final verification failed. Expected: "${jobTitle}", Got: "${finalValue}"`);
        return this.createError('TITLE_ENTRY_FAILED', `Failed to enter title correctly. Expected: "${jobTitle}", Got: "${finalValue}"`);
      }

    } catch (error) {
      logger.warn(`Failed to fill title field: ${error}`);
      return this.createError('TITLE_INPUT_NOT_FOUND', `Failed to fill title field: ${error}`);
    }
  }

  private async typeWithVerification(element: ElementHandle<Element>, text: string, fieldName: string): Promise<boolean> {
    try {
      logger.info(`Attempting to type "${text}" into ${fieldName} field with verification...`);
      
      // Focus the element first
      await element.focus();
      await this.randomDelay(300, 500);
      
      // Clear the field using the existing clearAndType method
      await this.clearAndType(element, text);
      
      // Wait for typing to complete
      await this.randomDelay(500, 1000);
      
      // Verify the typing was successful
      const enteredValue = await element.evaluate((el: Element) => (el as HTMLInputElement).value);
      
      if (enteredValue === text) {
        logger.info(`✅ ${fieldName} typing verification successful: "${enteredValue}"`);
        return true;
      } else {
        logger.warn(`⚠️ ${fieldName} typing verification failed. Expected: "${text}", Got: "${enteredValue}"`);
        
        // Try one more time with focus and retry
        logger.info(`Retrying ${fieldName} typing...`);
        await element.focus();
        await this.randomDelay(300, 500);
        await this.clearAndType(element, text);
        await this.randomDelay(500, 1000);
        
        const retryValue = await element.evaluate((el: Element) => (el as HTMLInputElement).value);
        if (retryValue === text) {
          logger.info(`✅ ${fieldName} retry typing verification successful: "${retryValue}"`);
          return true;
        } else {
          logger.warn(`⚠️ ${fieldName} retry typing verification failed. Expected: "${text}", Got: "${retryValue}"`);
          return false;
        }
      }
    } catch (error) {
      logger.warn(`Error in typeWithVerification for ${fieldName}: ${error}`);
      return false;
    }
  }

  private getJobTitle(): string {
    // Generate a professional job title based on the user's data or use a default
    const jobTitles = [
      'Full-Stack Software Engineer',
      'Senior Software Developer',
      'Web Application Developer',
      'Frontend Developer',
      'Backend Developer',
      'Software Engineer',
      'Full-Stack Developer',
      'React Developer',
      'Node.js Developer',
      'Python Developer',
      'JavaScript Developer',
      'TypeScript Developer',
      'DevOps Engineer',
      'Cloud Engineer',
      'Data Engineer',
      'Machine Learning Engineer',
      'UI/UX Developer',
      'Mobile App Developer',
      'System Administrator',
      'Database Administrator'
    ];

    // Use a random job title for variety
    const randomIndex = Math.floor(Math.random() * jobTitles.length);
    const selectedTitle = jobTitles[randomIndex];
    
    logger.info(`Selected job title: "${selectedTitle}"`);
    return selectedTitle;
  }
}
