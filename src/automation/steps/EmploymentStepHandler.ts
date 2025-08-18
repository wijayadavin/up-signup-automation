import { StepHandler } from '../StepHandler.js';
import { AutomationResult } from '../BaseAutomation.js';

const logger = {
  info: (message: string, ...args: any[]) => console.log(`[INFO] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[WARN] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[ERROR] ${message}`, ...args),
  debug: (message: string, ...args: any[]) => console.log(`[DEBUG] ${message}`, ...args),
};

export class EmploymentStepHandler extends StepHandler {
  constructor(page: any, user: any) {
    super(page, user, 'employment');
  }

  private async handleComboboxSelection(): Promise<void> {
    try {
      // Wait a bit for any dropdown to appear
      await this.randomDelay(150, 300);
      
      // Try to press down arrow to select first option
      await this.page.keyboard.press('ArrowDown');
      await this.randomDelay(200, 300);
      
      // Try to press enter to accept selection
      await this.page.keyboard.press('Enter');
      await this.randomDelay(300, 500);
      
      logger.info('Attempted combobox selection with ArrowDown + Enter');
    } catch (error) {
      logger.warn('Error in combobox selection, continuing...');
    }
  }

  private async checkIfFirstLetterTyped(expectedText: string): Promise<boolean> {
    try {
      // Get the currently focused element and its value
      const focusedElement = await this.page.evaluate(() => {
        const activeEl = document.activeElement;
        if (!activeEl) return '';
        
        // Handle both input and textarea elements
        if (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement) {
          return activeEl.value;
        }
        
        // For contenteditable or other elements
        return activeEl.textContent || '';
      });
      
      // For empty or undefined text, return false
      if (!expectedText) {
        logger.warn('Expected text is empty');
        return false;
      }
      
      // Check if the first letter of expected text is in the focused element
      const firstLetter = expectedText.charAt(0).toLowerCase();
      const hasFirstLetter = focusedElement.toLowerCase().includes(firstLetter);
      
      logger.info(`Checking if first letter was typed - Expected: "${expectedText}", Current: "${focusedElement}", Has first letter: ${hasFirstLetter}`);
      return hasFirstLetter;
    } catch (error) {
      logger.warn('Error checking if first letter was typed:', error);
      return false;
    }
  }

  private async typeWithVerification(text: string, retries: number = 3): Promise<void> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      logger.info(`Attempt ${attempt} to type "${text}"`);
      
      // Type the text
      await this.typeHumanLike(text);
      await this.randomDelay(150, 300);
      
      // Verify first letter was typed
      const isTyped = await this.checkIfFirstLetterTyped(text);
      if (isTyped) {
        logger.info('Text verified as typed correctly');
        return;
      }
      
      // If not typed correctly and we have retries left, clear and try again
      if (attempt < retries) {
        logger.warn('Text not typed correctly, clearing and retrying...');
        await this.page.keyboard.down('Control');
        await this.page.keyboard.press('a');
        await this.page.keyboard.up('Control');
        await this.page.keyboard.press('Backspace');
        await this.randomDelay(150, 300);
      }
    }
    
    logger.warn(`Failed to verify text "${text}" was typed after ${retries} attempts`);
  }

  private async focusTitleInput(): Promise<void> {
    try {
      // Try to focus the specific title input element
      const titleInput = await this.page.$('input[role="combobox"][aria-labelledby="title-label"]');
      if (titleInput) {
        await titleInput.click();
        await this.randomDelay(150, 300);
        logger.info('Focused title input using specific selector');
      }
    } catch (error) {
      logger.warn('Could not focus title input with specific selector, continuing with tab navigation...');
    }
  }

  async execute(options?: { uploadOnly?: boolean; skipOtp?: boolean; skipLocation?: boolean }): Promise<AutomationResult> {
    try {
      logger.info('Handling employment step...');

      // Assert current route
      const currentUrl = this.page.url();
      if (!currentUrl.includes('/nx/create-profile/employment')) {
        // Check for landmark element as fallback
        const employmentHeading = await this.page.$('h1, h2, [role="heading"]');
        if (employmentHeading) {
          const headingText = await employmentHeading.evaluate(el => el.textContent?.toLowerCase() || '');
          if (!headingText.includes('employment') && !headingText.includes('experience')) {
            return this.createError('EMPLOYMENT_PAGE_NOT_FOUND', `Expected employment page, got ${currentUrl}`);
          }
        } else {
          return this.createError('EMPLOYMENT_PAGE_NOT_FOUND', `Expected employment page, got ${currentUrl}`);
        }
      }

      await this.waitForPageReady();
      this.screenshots.employment_before = await this.takeScreenshot('employment_before');

      // Step 1: Open "Add experience" modal
      const addButton = await this.waitForSelectorWithRetry([
        'button[data-qa="employment-add-btn"]',
        'button[data-ev-label="employment_add_btn"]',
        'a[data-ev-label="add_more_link"] button',
        '.carousel-list-add-new button',
        '[role="button"][aria-label*="Add experience"]',
        'button:contains("Add experience")',
        'button:contains("Add Experience")',
      ], 15000);

      if (!addButton) {
        return this.createError('EMPLOYMENT_ADD_BUTTON_NOT_FOUND', 'Add experience button not found');
      }

      // Get button text for logging
      const buttonText = await addButton.evaluate((el: Element) => 
        el.textContent?.trim() || ''
      );
      logger.info(`Found Add Experience button with text: "${buttonText}"`);

      // Click the button
      logger.info('Clicking Add Experience button...');
      await addButton.click();
      await this.randomDelay(700, 1000);
      
      logger.info('Add Experience button clicked, waiting for modal...');

      // Wait for modal to appear with retries
      let modalOpened = false;
      let attempt = 1;
      const maxAttempts = 3;

      while (attempt <= maxAttempts) {
        logger.info(`Attempt ${attempt}/${maxAttempts} to verify employment modal...`);

        // Check for the specific employment modal content
        const modalContent = await this.waitForSelectorWithRetry([
          '[data-qa="employment-dialog-body"]',
          '.air3-modal-content',
        ], 5000);

        if (modalContent) {
          // Verify it's the right modal by checking the title
          const modalTitle = await this.page.$('h2.air3-modal-title');
          const titleText = await modalTitle?.evaluate(el => el.textContent?.trim());
          
          if (titleText === 'Add Work Experience') {
            logger.info('Employment modal verified with correct title');
            modalOpened = true;
            break;
          }
        }

        if (attempt < maxAttempts) {
          logger.warn('Modal not found or incorrect, retrying...');
          await this.randomDelay(700, 1000);
          
          // Try clicking the add button again
          const addButton = await this.waitForSelectorWithRetry([
            'button[data-qa="employment-add-btn"]',
            'button[data-ev-label="employment_add_btn"]',
            'a[data-ev-label="add_more_link"] button',
          ], 5000);

          if (addButton) {
            await addButton.click();
            await this.randomDelay(700, 1000);
          }
        }

        attempt++;
      }

      if (!modalOpened) {
        return this.createError('EMPLOYMENT_MODAL_NOT_VISIBLE', 'Employment modal did not appear after 3 attempts');
      }

      logger.info('Employment modal opened successfully');
      this.screenshots.modal_before_fill = await this.takeScreenshot('modal_before_fill');

      // Fill out the employment form with sample data
      const employmentData = {
        work_title: 'Senior Software Engineer',
        work_company_name: 'Tech Solutions Inc',
        country_name: 'United States',
        work_start_year: '2020',
        work_end_year: '2023',
        work_description: 'Developed full-stack web applications using modern technologies. Led a team of 5 developers and implemented CI/CD pipelines.'
      };

      // Fill title field using tab navigation
      logger.info('Filling title field using tab navigation...');
      
      // Focus title field
      await this.page.keyboard.press('Tab'); // Focus combo box close button
      await this.randomDelay(150, 300);
      await this.page.keyboard.press('Tab'); // Focus title field
      await this.randomDelay(300, 600);
      
      // Type the title with verification
      await this.typeWithVerification(employmentData.work_title);
      await this.randomDelay(300, 600);
      
      // Handle combobox selection for title
      await this.handleComboboxSelection();
      
      // Fill company field using tab navigation
      logger.info('Filling company field using tab navigation...');
      
      // Tab to company field
      await this.page.keyboard.press('Tab'); // Focus combo box close button
      await this.randomDelay(150, 300);
      await this.page.keyboard.press('Tab'); // Focus company field
      await this.randomDelay(150, 300);
      
      // Type the company with verification
      await this.typeWithVerification(employmentData.work_company_name);
      await this.randomDelay(300, 600);
      
      // Handle combobox selection for company
      await this.handleComboboxSelection();

      // Fill location field using tab navigation
      logger.info('Filling location field using tab navigation...');
      
      // Tab to location field
      await this.page.keyboard.press('Tab'); // Focus combo box close button
      await this.randomDelay(150, 300);
      await this.page.keyboard.press('Tab'); // Focus location field
      await this.randomDelay(1000, 1500); // Longer delay before typing

      // Type location with verification
      await this.typeWithVerification('New York');
      await this.randomDelay(300, 600);
      
      // Handle combobox selection for location
      await this.handleComboboxSelection();
      await this.randomDelay(500, 700); // Extra delay after location selection
      
      // Fill country using specific steps
      logger.info('Filling country field...');
      
      // 1. Navigate to the country field with two tabs
      await this.page.keyboard.press('Tab'); // First tab
      await this.randomDelay(800, 1200);
      await this.page.keyboard.press('Tab'); // Second tab to country dropdown
      await this.randomDelay(500, 700); // Longer pause before opening dropdown
      
      // 2. Press enter to open dropdown
      logger.info('Opening country dropdown...');
      await this.page.keyboard.press('Enter');
      await this.randomDelay(1000, 1500); // Delay after opening dropdown
      
      // 3. Press shift+tab to focus search field
      logger.info('Focusing country search field...');
      await this.page.keyboard.down('Shift');
      await this.page.keyboard.press('Tab');
      await this.page.keyboard.up('Shift');
      await this.randomDelay(1000, 1500); // Delay before typing
      
      // 4. Type the country with verification
      await this.typeWithVerification('United States');
      await this.randomDelay(300, 600);
      
      // 5. Press down + enter to select
      await this.page.keyboard.press('ArrowDown');
      await this.randomDelay(150, 300);
      await this.page.keyboard.press('Enter');
      await this.randomDelay(300, 600);

      // Check "I am currently working in this role" checkbox
      logger.info('Checking currently working checkbox using tab navigation...');
      
      // Tab to checkbox
      await this.page.keyboard.press('Tab'); // Focus checkbox
      await this.randomDelay(150, 300);
      await this.page.keyboard.press('Space'); // Check the checkbox
      await this.randomDelay(150, 300);
      
      // Fill start date using tab navigation
      logger.info('Filling start date using tab navigation...');
      
      // Tab to start month dropdown
      await this.page.keyboard.press('Tab'); // Focus start month dropdown
      await this.randomDelay(150, 300);
      
      // Handle combobox selection for start month
      await this.handleComboboxSelection();
      
      // Add extra delay after month selection for stability
      await this.randomDelay(700, 1000);
      
      // Tab to start year dropdown
      await this.page.keyboard.press('Tab'); // Focus start year dropdown
      await this.randomDelay(300, 600);
      
      logger.info('Filling start year...');
      
      // First press enter to open the dropdown
      await this.page.keyboard.press('Enter');
      await this.randomDelay(1000, 1500);
      
      // Type the year with verification
      await this.typeWithVerification(employmentData.work_start_year);
      await this.randomDelay(1000, 1500);
      
      // Press down and enter to select
      await this.page.keyboard.press('ArrowDown');
      await this.randomDelay(800, 1200);
      await this.page.keyboard.press('Enter');
      await this.randomDelay(500, 700);
      
      // End year and month disabled if checkbox ticked, so no need to fill them
      
      // Fill description using tab navigation
      logger.info('Filling description using tab navigation...');
      
      // Tab to description textarea
      await this.page.keyboard.press('Tab'); // Focus description textarea
      await this.randomDelay(700, 1000); // Longer delay before description
      
      // Try to click the textarea directly as fallback
      try {
        const textarea = await this.page.$('textarea[aria-labelledby="description-label"]');
        if (textarea) {
          await textarea.click();
          await this.randomDelay(1000, 1500);
          logger.info('Clicked description textarea directly');
        }
      } catch (error) {
        logger.warn('Failed to click textarea directly, continuing with keyboard navigation');
      }
      
      // Clear any existing text first
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('a');
      await this.page.keyboard.up('Control');
      await this.page.keyboard.press('Backspace');
      await this.randomDelay(1000, 1500);
      
      // Type the description without verification (it's a textarea)
      logger.info('Typing description...');
      await this.typeHumanLike(employmentData.work_description);
      await this.randomDelay(700, 1000); // Longer delay after description

      this.screenshots.modal_after_fill = await this.takeScreenshot('modal_after_fill');

      // Add extra delay before trying to save
      await this.randomDelay(700, 1000);
      
      // Step 7: Save the employment entry
      logger.info('Looking for save button...');
      
      // First try to tab to the save button
      await this.page.keyboard.press('Tab'); // Should focus the cancel button
      await this.randomDelay(700, 1000);
      await this.page.keyboard.press('Tab'); // Should focus the save button
      await this.randomDelay(1000, 1500);
      
      // Try to click with Enter first
      try {
        await this.page.keyboard.press('Enter');
        await this.randomDelay(700, 1000);
        logger.info('Attempted to save using keyboard Enter');
        
        // Check if modal closed
        const modalClosed = !(await this.page.$('[data-qa="employment-dialog-body"]'));
        if (modalClosed) {
          logger.info('Modal closed successfully after keyboard save');
          return this.navigationAutomation.clickNextButton(this.stepName);
        }
      } catch (error) {
        logger.warn('Keyboard save attempt failed, trying button click...');
      }
      
      // If keyboard save failed, try clicking the button
      const saveButton = await this.waitForSelectorWithRetry([
        'button[data-qa="btn-save"]',
        'button[data-ev-label="btn_save"]',
        '[data-qa="btn-save"]',
        '.air3-modal-footer button.air3-btn-primary',
        'button.air3-btn-primary',
        '[role="button"][aria-label*="Save"]',
        'button:contains("Save")',
      ], 10000);

      if (!saveButton) {
        return this.createError('MODAL_SAVE_NOT_FOUND', 'Save button not found in modal');
      }

      logger.info('Found save button, attempting to click...');
      await saveButton.click();
      await this.randomDelay(1000, 1300); // Longer delay after save

      this.screenshots.modal_after_save = await this.takeScreenshot('modal_after_save');

      // Wait for modal to fully close with retries
      let modalClosed = false;
      let attempts = 0;
      const maxAttempts = 5;

      while (attempts < maxAttempts) {
        logger.info(`Attempt ${attempts + 1}/${maxAttempts} to verify modal closed...`);
        const modalStillOpen = await this.page.$('[role="dialog"], [data-qa="employment-dialog-body"]');
        
        if (!modalStillOpen) {
          modalClosed = true;
          logger.info('Modal confirmed closed');
          break;
        }
        
        logger.info('Modal still open, waiting...');
        await this.randomDelay(1000, 1500);
        attempts++;
      }

      if (!modalClosed) {
        return this.createError('EMPLOYMENT_ENTRY_NOT_CONFIRMED', 'Modal did not close after saving');
      }

      // Extra delay after modal closes before clicking Next
      await this.randomDelay(700, 1000);
      logger.info('Employment step completed successfully, clicking Next...');
      
      // Click Next button to proceed
      const navigationResult = await this.navigationAutomation.clickNextButton(this.stepName);
      this.screenshots.employment_after = await this.takeScreenshot('employment_after');
      return navigationResult;

    } catch (error) {
      return this.createError(
        'EMPLOYMENT_STEP_FAILED',
        `Employment step failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
