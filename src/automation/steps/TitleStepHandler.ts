import { StepHandler } from '../StepHandler.js';
import { AutomationResult } from '../BaseAutomation.js';

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

      let titleInput = null;
      let selectionMethod = '';

      // Try to find the title input using the selectors in order
      for (let i = 0; i < titleInputSelectors.length; i++) {
        const selector = titleInputSelectors[i];
        logger.info(`Trying selector ${i + 1}/${titleInputSelectors.length}: ${selector}`);
        
        try {
          const inputElement = await this.page.$(selector);
          if (inputElement) {
            titleInput = inputElement;
            const placeholder = await inputElement.evaluate((el: Element) => 
              (el as HTMLInputElement).placeholder || ''
            );
            
            selectionMethod = `Found title input via selector ${i + 1}: ${selector} (placeholder: "${placeholder}")`;
            logger.info(selectionMethod);
            break;
          }
        } catch (error) {
          logger.warn(`Selector ${selector} failed: ${error}`);
          continue;
        }
      }

      if (!titleInput) {
        logger.warn('No title input found, will try fallback navigation...');
        return this.createError('TITLE_INPUT_NOT_FOUND', 'Title input field not found');
      }

      logger.info(`Selection method: ${selectionMethod}`);

      // Step 1: Click on the input field to focus it
      logger.info('Clicking on title input field...');
      await this.clickElement(titleInput);
      await this.randomDelay(500, 1000);

      // Step 2: Clear the field using keyboard shortcuts
      logger.info('Clearing title input field...');
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('KeyA');
      await this.page.keyboard.up('Control');
      await this.page.keyboard.press('Backspace');
      await this.randomDelay(500, 1000);

      // Step 3: Type the job title
      const jobTitle = this.getJobTitle();
      logger.info(`Typing job title: "${jobTitle}"`);
      
      // Strategy 1: Type with human-like delays
      logger.info('Strategy 1: Human-like typing...');
      await this.typeHumanLike(jobTitle);
      await this.randomDelay(1000, 2000);

      // Strategy 2: JavaScript set value as fallback
      logger.info('Strategy 2: JavaScript set value...');
      await titleInput.evaluate((el: Element, value: string) => {
        const input = el as HTMLInputElement;
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, jobTitle);
      await this.randomDelay(1000, 2000);

      // Step 4: Verify the title was entered correctly
      const enteredValue = await titleInput.evaluate((el: Element) => 
        (el as HTMLInputElement).value
      );
      
      if (enteredValue === jobTitle) {
        logger.info(`✅ Title entered successfully: "${enteredValue}"`);
      } else {
        logger.warn(`⚠️ Title verification failed. Expected: "${jobTitle}", Got: "${enteredValue}"`);
        // Try one more time with JavaScript
        await titleInput.evaluate((el: Element, value: string) => {
          const input = el as HTMLInputElement;
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }, jobTitle);
        await this.randomDelay(500, 1000);
      }

      return this.createSuccess();

    } catch (error) {
      logger.warn(`Failed to fill title field: ${error}, will try fallback navigation...`);
      return this.createError('TITLE_INPUT_NOT_FOUND', `Failed to fill title field: ${error}`);
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
