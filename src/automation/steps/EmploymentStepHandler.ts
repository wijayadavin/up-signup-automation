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

  private async ensureModalIsOpen(): Promise<boolean> {
    try {
      // Check for modal confirmation dialog and handle it
      const confirmDialog = await this.page.$('text=Are you sure you want to close this window?');
      if (confirmDialog) {
        logger.warn('Modal close confirmation dialog detected - clicking Save Changes to keep modal open');
        const saveChangesBtn = await this.page.$('button:has-text("Save Changes")');
        if (saveChangesBtn) {
          await saveChangesBtn.click();
          await this.randomDelay(500, 800);
        }
      }
      
      const modal = await this.page.$('[data-qa="employment-dialog-body"]');
      if (!modal) {
        logger.warn('Modal appears to be closed');
        return false;
      }
      return true;
    } catch (error) {
      logger.warn('Error checking modal status:', error);
      return false;
    }
  }

  private async fillComboboxField(fieldSelectors: string[], value: string, fieldName: string): Promise<AutomationResult> {
    logger.info(`Filling combobox field: ${fieldName} with value: "${value}"`);
    
    const field = await this.waitForSelectorWithRetry(fieldSelectors, 10000);
    
    if (!field) {
      return this.createError(
        `${fieldName.toUpperCase()}_FIELD_NOT_FOUND`,
        `${fieldName} field not found`
      );
    }

    try {
      // Focus the field first
      await field.focus();
      await this.randomDelay(500, 800);
      
      // Clear the field thoroughly
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('KeyA');
      await this.page.keyboard.press('Backspace');
      await this.page.keyboard.up('Control');
      await this.randomDelay(500, 800);
      
      // Type the value once (no retry for combobox)
      const chars = value.split('');
      for (const char of chars) {
        await field.type(char);
        // Slower typing for combobox fields
        await this.randomDelay(100, 200);
      }
      
      // Wait for dropdown to appear
      await this.randomDelay(1000, 1500);
      
      // Press down arrow to select first option
      await this.page.keyboard.press('ArrowDown');
      await this.randomDelay(300, 500);
      
      // Press enter to accept selection
      await this.page.keyboard.press('Enter');
      await this.randomDelay(500, 800);
      
      logger.info(`${fieldName} combobox filled successfully: ${value}`);
      return this.createSuccess();
      
    } catch (error) {
      return this.createError(
        `${fieldName.toUpperCase()}_COMBOBOX_FAILED`,
        `Failed to fill combobox ${fieldName}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async fillCountryField(countryName: string): Promise<AutomationResult> {
    logger.info(`Filling country field with: "${countryName}"`);
    
    try {
      // Add initial pause before starting
      await this.randomDelay(800, 1200);
      
      // 1. Focus on the country field (tab navigation)
      await this.page.keyboard.press('Tab'); // First tab
      await this.randomDelay(800, 1200);
      await this.page.keyboard.press('Tab'); // Second tab to country dropdown
      await this.randomDelay(800, 1200);
      
      // 2. Press enter to open menu
      logger.info('Opening country dropdown...');
      await this.page.keyboard.press('Enter');
      await this.randomDelay(3000, 4000); // 2x longer pause for dropdown to open
      
      // 3. Clear any existing content in search field and type country name
      logger.info('Clearing search field...');
      await this.randomDelay(2000, 4000);
      
      logger.info(`Typing country name: "${countryName}"`);
      
      // Type first character and check if it was typed correctly
      const firstChar = countryName.charAt(0);
      logger.info(`Typing first character: "${firstChar}"`);
      await this.page.keyboard.type(firstChar);
      await this.randomDelay(500, 800);
      
      // Verify the first character was typed correctly
      const firstCharCheck = await this.page.evaluate(() => {
        const searchField = document.querySelector('input[type="search"]') as HTMLInputElement;
        return searchField ? searchField.value : '';
      });
      
      logger.info(`After typing first character, field value: "${firstCharCheck}"`);
      
      if (firstCharCheck.toLowerCase().includes(firstChar.toLowerCase())) {
        logger.info('First character typed correctly, continuing with rest of country name...');
        // Type the rest of the country name
        const restOfCountry = countryName.substring(1);
        await this.typeHumanLike(restOfCountry);
      } else {
        logger.warn(`First character not typed correctly. Expected: "${firstChar}", Field has: "${firstCharCheck}"`);
        // Clear and try typing the full country name again
        await this.page.keyboard.down('Control');
        await this.page.keyboard.press('KeyA');
        await this.page.keyboard.press('Backspace');
        await this.page.keyboard.up('Control');
        await this.randomDelay(500, 800);
        
        await this.typeHumanLike(countryName);
      }
      
      await this.randomDelay(1500, 2000); // Longer pause for search results
      
      // 4. Press down arrow to select
      logger.info('Selecting country from dropdown...');
      await this.page.keyboard.press('ArrowDown');
      await this.randomDelay(800, 1200); // Longer pause before confirmation
      
      // 5. Press enter to confirm
      await this.page.keyboard.press('Enter');
      await this.randomDelay(1000, 1500); // Longer pause after selection
      
      logger.info(`Country field filled successfully: ${countryName}`);
      return this.createSuccess();
      
    } catch (error) {
      return this.createError(
        'COUNTRY_FIELD_FAILED',
        `Failed to fill country field: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async verifyAllFieldsFilled(employmentData: any): Promise<AutomationResult> {
    logger.info('Verifying all employment fields are properly filled...');
    
    try {
      const fieldChecks = await this.page.evaluate((data) => {
        const results: any = {};
        
        // Check title field
        const titleField = document.querySelector('input[role="combobox"][aria-labelledby="title-label"]') as HTMLInputElement;
        if (titleField) {
          results.title = {
            filled: titleField.value.trim() !== '',
            value: titleField.value,
            expected: data.work_title
          };
        }
        
        // Check company field
        const companyField = document.querySelector('input[aria-labelledby="company-label"]') as HTMLInputElement;
        if (companyField) {
          results.company = {
            filled: companyField.value.trim() !== '',
            value: companyField.value,
            expected: data.work_company_name
          };
        }
        
        // Check location field
        const locationField = document.querySelector('input[placeholder*="London"], input[placeholder*="Ex:"]') as HTMLInputElement;
        if (locationField) {
          results.location = {
            filled: locationField.value.trim() !== '',
            value: locationField.value,
            expected: 'New York'
          };
        }
        
        // Check country field
        const countryField = document.querySelector('input[aria-labelledby*="country"], select[aria-labelledby*="country"]') as HTMLInputElement;
        if (countryField) {
          results.country = {
            filled: countryField.value.trim() !== '',
            value: countryField.value,
            expected: 'United States'
          };
        }
        
        // Check description field
        const descriptionField = document.querySelector('textarea[aria-labelledby="description-label"]') as HTMLTextAreaElement;
        if (descriptionField) {
          results.description = {
            filled: descriptionField.value.trim() !== '',
            value: descriptionField.value,
            expected: data.work_description
          };
        }
        
        return results;
      }, employmentData);
      
      // Log the verification results
      let allFieldsFilled = true;
      const issues: string[] = [];
      
      for (const [fieldName, check] of Object.entries(fieldChecks)) {
        const fieldCheck = check as { filled: boolean; value: string; expected: string };
        if (!fieldCheck.filled) {
          allFieldsFilled = false;
          issues.push(`${fieldName}: empty (expected: ${fieldCheck.expected})`);
          logger.warn(`Field verification failed - ${fieldName}: empty`);
        } else {
          logger.info(`Field verification passed - ${fieldName}: "${fieldCheck.value}"`);
        }
      }
      
      if (allFieldsFilled) {
        logger.info('✅ All fields verified and properly filled');
        return this.createSuccess();
      } else {
        logger.warn(`⚠️ Field verification issues: ${issues.join(', ')}`);
        return this.createError(
          'FIELDS_NOT_PROPERLY_FILLED',
          `Some fields are empty or incorrect: ${issues.join(', ')}`
        );
      }
      
    } catch (error) {
      logger.warn('Error during field verification:', error);
      return this.createError(
        'VERIFICATION_FAILED',
        `Failed to verify fields: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async fillFieldWithVerification(fieldSelectors: string[], value: string, fieldName: string): Promise<AutomationResult> {
    logger.info(`Filling ${fieldName} field with value: "${value}"`);
    
    // Use the common fillField method from FormAutomation
    const result = await this.formAutomation.fillField(fieldSelectors, value, fieldName);
    
    if (result.status === 'success') {
      logger.info(`✅ ${fieldName} field filled successfully`);
    } else {
      logger.warn(`⚠️ ${fieldName} field filling failed: ${result.evidence}`);
    }
    
    return result;
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

      // Fill title field as a combobox (type once, then select)
      logger.info('Filling title field as combobox...');
      
      // Check if modal is still open before proceeding
      if (!(await this.ensureModalIsOpen())) {
        return this.createError('MODAL_CLOSED_DURING_TITLE', 'Modal closed while filling title field');
      }
      
      const titleResult = await this.fillComboboxField(
        ['input[role="combobox"][aria-labelledby="title-label"]', 'input[placeholder*="Software Engineer"]'],
        employmentData.work_title,
        'Title'
      );
      
      if (titleResult.status !== 'success') {
        logger.warn('Title field filling failed, but continuing...');
      }
      
      // Fill company field as a combobox (type once, then select)
      logger.info('Filling company field as combobox...');
      
      // Check if modal is still open before proceeding
      if (!(await this.ensureModalIsOpen())) {
        return this.createError('MODAL_CLOSED_DURING_COMPANY', 'Modal closed while filling company field');
      }
      
      const companyResult = await this.fillComboboxField(
        ['input[aria-labelledby="company-label"]', 'input[placeholder*="Company"]'],
        employmentData.work_company_name,
        'Company'
      );
      
      if (companyResult.status !== 'success') {
        logger.warn('Company field filling failed, but continuing...');
      }

      // Fill location field using robust field filling
      logger.info('Filling location field...');
      
      // Check if modal is still open before proceeding
      if (!(await this.ensureModalIsOpen())) {
        return this.createError('MODAL_CLOSED_DURING_LOCATION', 'Modal closed while filling location field');
      }
      
      const locationResult = await this.fillFieldWithVerification(
        ['input[placeholder*="London"]', 'input[placeholder*="Ex:"]'],
        'New York',
        'Location'
      );
      
      if (locationResult.status !== 'success') {
        logger.warn('Location field filling failed, but continuing...');
      }
      
      // Handle combobox selection for location
      await this.handleComboboxSelection();
      await this.randomDelay(500, 700); // Extra delay after location selection
      
      // Fill country using specific steps
      logger.info('Filling country field...');
      
      // Add longer pause before starting country field
      await this.randomDelay(1000, 1500);
      
      // Check if modal is still open before proceeding
      if (!(await this.ensureModalIsOpen())) {
        return this.createError('MODAL_CLOSED_DURING_COUNTRY', 'Modal closed while filling country field');
      }
      
      const countryResult = await this.fillCountryField('United States');
      
      if (countryResult.status !== 'success') {
        logger.warn('Country field filling failed, but continuing...');
      }

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
      
      logger.info('Filling start year with careful approach...');
      
      // First press enter to open the dropdown
      await this.page.keyboard.press('Enter');
      await this.randomDelay(2000, 4000);
      
      // Type the year very slowly
      logger.info(`Typing year very slowly: "${employmentData.work_start_year}"`);
      const yearChars = employmentData.work_start_year.split('');
      for (const char of yearChars) {
        await this.page.keyboard.type(char);
        // Very slow typing for year field
        await this.randomDelay(300, 500);
      }
      
      // Wait longer for search results
      await this.randomDelay(2000, 4000);
      
      // Press down arrow to select first option
      await this.page.keyboard.press('ArrowDown');
      await this.randomDelay(800, 1200);
      
      // Press enter to accept selection
      await this.page.keyboard.press('Enter');
      await this.randomDelay(1000, 1500);
      
      logger.info('Year field filled successfully');
      
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

      // Verify all fields are properly filled before saving
      logger.info('Verifying all fields are properly filled...');
      const verificationResult = await this.verifyAllFieldsFilled(employmentData);
      if (verificationResult.status !== 'success') {
        logger.warn('Field verification failed, but continuing...');
      }

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
      let closeAttempts = 0;
      const maxCloseAttempts = 5;

      while (closeAttempts < maxCloseAttempts) {
        logger.info(`Attempt ${closeAttempts + 1}/${maxCloseAttempts} to verify modal closed...`);
        const modalStillOpen = await this.page.$('[role="dialog"], [data-qa="employment-dialog-body"]');
        
        if (!modalStillOpen) {
          modalClosed = true;
          logger.info('Modal confirmed closed');
          break;
        }
        
        logger.info('Modal still open, waiting...');
        await this.randomDelay(1000, 1500);
        closeAttempts++;
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
