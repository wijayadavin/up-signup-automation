import { StepHandler } from '../StepHandler.js';
import { AutomationResult } from '../BaseAutomation.js';
import { ModalHandler } from '../common/ModalHandler.js';

const logger = {
  info: (message: string, ...args: any[]) => console.log(`[INFO] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[WARN] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[ERROR] ${message}`, ...args),
  debug: (message: string, ...args: any[]) => console.log(`[DEBUG] ${message}`, ...args),
};

export class EducationStepHandler extends StepHandler {
  private modalHandler: ModalHandler;

  constructor(page: any, user: any) {
    super(page, user, 'education');
    this.modalHandler = new ModalHandler(page);
  }

  async execute(options?: { uploadOnly?: boolean; skipOtp?: boolean; skipLocation?: boolean }): Promise<AutomationResult> {
    try {
      logger.info('Handling education step...');

      // Wait for navigation and validate current page
      logger.info('Waiting for education page to load...');
      
      // Wait for the URL to contain education
      let attempt = 0;
      const maxAttempts = 5;
      let onEducationPage = false;
      
      while (attempt < maxAttempts) {
        attempt++;
        const currentUrl = this.page.url();
        logger.info(`Current URL (attempt ${attempt}/${maxAttempts}): ${currentUrl}`);
        
        if (currentUrl.includes('/nx/create-profile/education')) {
          onEducationPage = true;
          break;
        }
        
        logger.info('Not on education page yet, waiting...');
        await this.randomDelay(1000, 1500);
      }
      
      if (!onEducationPage) {
        return this.createError(
          'EDUCATION_PAGE_NOT_FOUND',
          'Failed to reach education page after multiple attempts'
        );
      }
      
      logger.info('Successfully reached education page');
      await this.waitForPageReady();
      
      // Wait for the Add Education button specifically
      const contentReady = await this.waitForSelectorWithRetry([
        // Add education button with all its attributes
        'button[data-qa="education-add-btn"][data-ev-label="education_add_btn"][aria-labelledby="add-education-label"]',
        
        // Add education label
        '#add-education-label',
        
        // Parent container structure
        '.carousel-list-add-new',
        '.up-n-link.d-md-block.carousel-list-add-new'
      ], 20000);
      
      if (!contentReady) {
        return this.createError(
          'EDUCATION_PAGE_NOT_READY',
          'Education page content not ready'
        );
      }
      
      logger.info('Education page content ready');
      this.screenshots.education_before = await this.takeScreenshot('education_before');

      // Check if we're in upload mode
      const isUploadMode = options?.uploadOnly === true;
      logger.info(`Education mode: ${isUploadMode ? 'Upload' : 'Manual'}`);
      
      if (isUploadMode) {
        // Upload mode: try Next button first, then add education if needed
        logger.info('Upload mode: trying Next button first...');
        const nextResult = await this.tryNextButtonFirst();
        if (nextResult) {
          this.screenshots.education_after = await this.takeScreenshot('education_after');
          return nextResult;
        }
        
        // Next button not found, proceed with adding education
        logger.info('Upload mode: Next button not found, proceeding with adding education...');
      } else {
        // Manual mode: always add education
        logger.info('Manual mode: proceeding with adding education...');
      }

      // Step 1: Open education modal
      // Precise selectors for the Add Education button
      const addButtonSelectors = [
        // Primary: Most specific selector
        'a[data-ev-label="add_more_link"] button[data-qa="education-add-btn"][data-ev-label="education_add_btn"][aria-labelledby="add-education-label"]',
        
        // Fallbacks with combinations of attributes
        'button[data-qa="education-add-btn"][data-ev-label="education_add_btn"]',
        'button[data-qa="education-add-btn"][aria-labelledby="add-education-label"]',
        
        // Individual attribute selectors
        'button[data-qa="education-add-btn"]',
        'button[data-ev-label="education_add_btn"]',
        
        // Parent structure based
        'a.carousel-list-add-new button',
        '.up-n-link.carousel-list-add-new button',
        
        // Most generic fallback
        'button[aria-labelledby="add-education-label"]'
      ];

      const modalSelectors = [
        '[data-qa="education-dialog-body"]',
        '.air3-modal-content',
      ];

      const modalResult = await this.modalHandler.openModalWithRetry(
        addButtonSelectors,
        modalSelectors,
        'Add Education History',
        'EDUCATION',
        3
      );

      if (modalResult.status !== 'success') {
        return modalResult;
      }

      // Step 2: Fill the form
      logger.info('Education modal opened, filling form...');
      const fillResult = await this.fillEducationModal();
      if (fillResult.status !== 'success') {
        return fillResult;
      }

      // Step 3: Click Save button
      logger.info('Clicking Save button...');
      const saveResult = await this.clickSaveButton();
      if (saveResult.status !== 'success') {
        return saveResult;
      }

            // Step 4: Wait for modal to close and verify
      logger.info('Waiting for modal to close...');
      
      // Wait for modal to disappear with better detection
      let modalClosed = false;
      let closeAttempts = 0;
      const maxCloseAttempts = 5;

      while (closeAttempts < maxCloseAttempts) {
        logger.info(`Attempt ${closeAttempts + 1}/${maxCloseAttempts} to verify modal closed...`);
        
        // Check if modal is still present and visible
        const modalStillOpen = await this.page.evaluate(() => {
          const modal = document.querySelector('[role="dialog"], [data-qa="education-dialog-body"], .air3-modal-content');
          if (!modal) return false;
          
          const style = window.getComputedStyle(modal as HTMLElement);
          return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        });
        
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
        logger.warn('Modal close verification failed, but continuing...');
      }

      // Extra delay after modal closes before clicking Next
      await this.randomDelay(1000, 1500);
      
      // Step 5: Click Next button
      logger.info('Looking for Next button...');
      const nextButton = await this.waitForSelectorWithRetry([
        'button[data-test="next-button"]',
        'button[data-ev-label="wizard_next"]',
        'button.air3-btn-primary',
        'button:contains("Next")'
      ], 10000);

      if (!nextButton) {
        return this.createError('NEXT_BUTTON_NOT_FOUND', 'Next button not found after education step');
      }

      logger.info('Found Next button, clicking...');
      await nextButton.click();
      await this.randomDelay(1000, 1500);
      
      this.screenshots.education_after = await this.takeScreenshot('education_after');
      return this.createSuccess();

    } catch (error) {
      return this.createError(
        'EDUCATION_STEP_FAILED',
        `Education step failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async clickAddEducationButton(): Promise<AutomationResult> {
    try {
      logger.info('Attempting to click Add Education button...');

      // Multiple strategies to find the Add Education button
      const addButtonSelectors = [
        // Primary: Target by data-qa attribute
        'button[data-qa="education-add-btn"]',
        
        // Alternative: Target by data-ev-label
        'button[data-ev-label="education_add_btn"]',
        
        // Alternative: Target by aria-labelledby
        'button[aria-labelledby="add-education-label"]',
        
        // Alternative: Target by link structure
        'a[data-ev-label="add_more_link"] button',
        
        // Alternative: Target by class structure
        '.carousel-list-add-new button',
        
        // Alternative: Target by text content
        'button:contains("Add education")',
        'button:contains("Add Education")',
        
        // Fallback: any button with add education text
        'button'
      ];

      let addButton = null;
      let selectionMethod = '';

      // Try to find the Add Education button using the selectors in order
      for (let i = 0; i < addButtonSelectors.length; i++) {
        const selector = addButtonSelectors[i];
        logger.info(`Trying selector ${i + 1}/${addButtonSelectors.length}: ${selector}`);
        
        try {
          const buttonElements = await this.page.$$(selector);
          logger.info(`Found ${buttonElements.length} button elements with selector: ${selector}`);
          
          // Find the button with "Add education" text
          for (const button of buttonElements) {
            const buttonText = await button.evaluate((el: Element) => 
              el.textContent?.trim() || ''
            );
            
            if (buttonText.toLowerCase().includes('add education') || 
                buttonText.toLowerCase().includes('add education')) {
              addButton = button;
              selectionMethod = `Found Add Education button via selector ${i + 1}: ${selector} (text: "${buttonText}")`;
              logger.info(selectionMethod);
              break;
            }
          }
          
          if (addButton) break;
        } catch (error) {
          logger.warn(`Selector ${selector} failed: ${error}`);
          continue;
        }
      }

      if (!addButton) {
        logger.warn('No Add Education button found, will try fallback navigation...');
        return this.createError('EDUCATION_ADD_BUTTON_NOT_FOUND', 'Add Education button not found');
      }

      logger.info(`Selection method: ${selectionMethod}`);

      // Click the Add Education button
      logger.info('Clicking Add Education button...');
      
      // Strategy 1: Direct click
      logger.info('Strategy 1: Direct click...');
      await this.clickElement(addButton);
      await this.randomDelay(2000, 3000);

      // Strategy 2: JavaScript click
      logger.info('Strategy 2: JavaScript click...');
      await addButton.evaluate((el: Element) => {
        const button = el as HTMLButtonElement;
        button.click();
      });
      await this.randomDelay(2000, 3000);

      logger.info('Successfully clicked Add Education button');
      return this.createSuccess();

    } catch (error) {
      logger.warn(`Failed to click Add Education button: ${error}, will try fallback navigation...`);
      return this.createError('EDUCATION_ADD_BUTTON_NOT_FOUND', `Failed to click Add Education button: ${error}`);
    }
  }

  private async fillEducationModal(): Promise<AutomationResult> {
    try {
      logger.info('Attempting to fill education modal...');

      // Wait for modal to appear
      const modal = await this.waitForSelectorWithRetry([
        '[role="dialog"]',
        '.modal',
        '[data-test="modal"]',
        '.air3-modal-content',
        '[data-qa="education-dialog-body"]'
      ], 20000);

      if (!modal) {
        logger.warn('No education modal found, will try fallback navigation...');
        return this.createError('EDUCATION_MODAL_NOT_VISIBLE', 'Education modal did not appear');
      }

      logger.info('Education modal appeared, filling form...');
      this.screenshots.modal_before_fill = await this.takeScreenshot('modal_before_fill');

      // Education data
      const educationData = {
        school_name: 'University of People',
        degree: 'Bachelor of Science',
        field_of_study: 'Computer Science',
        year_from: '2018',
        year_to: '2022',
        description: 'Studied computer science with focus on software engineering and algorithms.'
      };

      // Use tab navigation to fill the form
      const fillResult = await this.fillEducationFormWithTabNavigation(modal, educationData);
      return fillResult;

    } catch (error) {
      logger.warn(`Failed to fill education modal: ${error}, will try fallback navigation...`);
      return this.createError('EDUCATION_MODAL_FILL_FAILED', `Failed to fill education modal: ${error}`);
    }
  }

  private async fillSchoolField(school: string): Promise<AutomationResult> {
    try {
      const schoolInput = await this.waitForSelectorWithRetry([
        'input[aria-labelledby="school-label"]',
        'input[role="combobox"][type="search"][aria-labelledby="school-label"]',
        'input[data-ev-label="typeahead_input"][aria-labelledby="school-label"]',
        'input[placeholder*="Northwestern University"]',
        'input[type="search"][aria-labelledby="school-label"]'
      ], 20000);

      if (!schoolInput) {
        return this.createError('MODAL_SCHOOL_INPUT_NOT_FOUND', 'School input not found in modal');
      }

      await schoolInput.click();
      await this.randomDelay(500, 1000);
      await schoolInput.evaluate((el: Element) => (el as HTMLInputElement).value = ''); // Clear field
      await this.typeHumanLike(school);
      await this.randomDelay(1000, 2000);

      return this.createSuccess();
    } catch (error) {
      return this.createError('MODAL_SCHOOL_INPUT_NOT_FOUND', `Failed to fill school field: ${error}`);
    }
  }

  private async fillDegreeField(degree: string): Promise<AutomationResult> {
    try {
      const degreeInput = await this.waitForSelectorWithRetry([
        'input[aria-labelledby="degree-label"]',
        'input[role="combobox"][type="search"][aria-labelledby="degree-label"]',
        'input[data-ev-label="typeahead_input"][aria-labelledby="degree-label"]',
        'input[placeholder*="Bachelors"]',
        'input[type="search"][aria-labelledby="degree-label"]'
      ], 20000);

      if (!degreeInput) {
        return this.createError('MODAL_DEGREE_INPUT_NOT_FOUND', 'Degree input not found in modal');
      }

      await degreeInput.click();
      await this.randomDelay(500, 1000);
      await degreeInput.evaluate((el: Element) => (el as HTMLInputElement).value = ''); // Clear field
      await this.typeHumanLike(degree);
      await this.randomDelay(1000, 2000);

      return this.createSuccess();
    } catch (error) {
      return this.createError('MODAL_DEGREE_INPUT_NOT_FOUND', `Failed to fill degree field: ${error}`);
    }
  }

  private async fillFieldOfStudyField(fieldOfStudy: string): Promise<AutomationResult> {
    try {
      const fieldInput = await this.waitForSelectorWithRetry([
        'input[aria-labelledby="area-of-study-label"]',
        'input[role="combobox"][type="search"][aria-labelledby="area-of-study-label"]',
        'input[data-ev-label="typeahead_input"][aria-labelledby="area-of-study-label"]',
        'input[placeholder*="Computer Science"]',
        'input[type="search"][aria-labelledby="area-of-study-label"]'
      ], 20000);

      if (!fieldInput) {
        return this.createError('MODAL_FIELD_OF_STUDY_INPUT_NOT_FOUND', 'Field of study input not found in modal');
      }

      await fieldInput.click();
      await this.randomDelay(500, 1000);
      await fieldInput.evaluate((el: Element) => (el as HTMLInputElement).value = ''); // Clear field
      await this.typeHumanLike(fieldOfStudy);
      await this.randomDelay(1000, 2000);

      return this.createSuccess();
    } catch (error) {
      return this.createError('MODAL_FIELD_OF_STUDY_INPUT_NOT_FOUND', `Failed to fill field of study: ${error}`);
    }
  }

  private async fillDatesAttended(yearFrom: string, yearTo: string): Promise<AutomationResult> {
    try {
      // Fill year from
      const yearFromDropdown = await this.waitForSelectorWithRetry([
        '[data-qa="year-from"] .air3-dropdown-toggle',
        '[data-qa="year-from"] [role="combobox"]',
        '[data-qa="year-from"] .air3-dropdown-toggle'
      ], 20000);

      if (!yearFromDropdown) {
        return this.createError('MODAL_YEAR_FROM_NOT_FOUND', 'Year from dropdown not found in modal');
      }

      await yearFromDropdown.click();
      await this.randomDelay(1000, 2000);
      
      // Select the year from
      const yearFromOption = await this.waitForSelectorWithRetry([
        `[role="option"]:contains("${yearFrom}")`,
        `li:contains("${yearFrom}")`,
        `div:contains("${yearFrom}")`
      ], 5000);

      if (yearFromOption) {
        await yearFromOption.click();
        await this.randomDelay(500, 1000);
        logger.info(`Selected year from: ${yearFrom}`);
      }

      // Fill year to
      const yearToDropdown = await this.waitForSelectorWithRetry([
        '[data-qa="year-to"] .air3-dropdown-toggle',
        '[data-qa="year-to"] [role="combobox"]',
        '[data-qa="year-to"] .air3-dropdown-toggle'
      ], 20000);

      if (!yearToDropdown) {
        return this.createError('MODAL_YEAR_TO_NOT_FOUND', 'Year to dropdown not found in modal');
      }

      await yearToDropdown.click();
      await this.randomDelay(1000, 2000);
      
      // Select the year to
      const yearToOption = await this.waitForSelectorWithRetry([
        `[role="option"]:contains("${yearTo}")`,
        `li:contains("${yearTo}")`,
        `div:contains("${yearTo}")`
      ], 5000);

      if (yearToOption) {
        await yearToOption.click();
        await this.randomDelay(500, 1000);
        logger.info(`Selected year to: ${yearTo}`);
      }

      return this.createSuccess();
    } catch (error) {
      return this.createError('MODAL_DATES_NOT_FOUND', `Failed to fill dates: ${error}`);
    }
  }

  private async fillDescriptionField(description: string): Promise<AutomationResult> {
    try {
      const descriptionTextarea = await this.waitForSelectorWithRetry([
        'textarea[aria-labelledby="description-label"]',
        'textarea[data-qa="description"]',
        'textarea[placeholder*="Describe your studies"]',
        'textarea'
      ], 20000);

      if (!descriptionTextarea) {
        return this.createError('MODAL_DESCRIPTION_NOT_FOUND', 'Description textarea not found in modal');
      }

      await descriptionTextarea.click();
      await this.randomDelay(500, 1000);
      await descriptionTextarea.evaluate((el: Element) => (el as HTMLTextAreaElement).value = ''); // Clear field
      await this.typeHumanLike(description);
      await this.randomDelay(1000, 2000);

      return this.createSuccess();
    } catch (error) {
      return this.createError('MODAL_DESCRIPTION_NOT_FOUND', `Failed to fill description field: ${error}`);
    }
  }

  private async clickSaveButton(): Promise<AutomationResult> {
    try {
      const saveButton = await this.waitForSelectorWithRetry([
        'button[data-qa="btn-save"]',
        'button[data-ev-label="btn_save"]',
        'button:contains("Save")',
        'button.air3-btn-primary'
      ], 20000);

      if (!saveButton) {
        return this.createError('EDUCATION_SAVE_BUTTON_NOT_FOUND', 'Save button not found in modal');
      }

      logger.info('Clicking Save button...');
      await this.clickElement(saveButton);
      await this.randomDelay(2000, 3000);

      return this.createSuccess();
    } catch (error) {
      return this.createError('EDUCATION_SAVE_BUTTON_NOT_FOUND', `Failed to click Save button: ${error}`);
    }
  }

  private async waitForModalClose(): Promise<AutomationResult> {
    try {
      logger.info('Waiting for modal to close...');
      
      // Wait for modal to disappear
      await this.page.waitForFunction(() => {
        const modal = document.querySelector('[role="dialog"], .modal, [data-test="modal"], .air3-modal-content');
        return !modal || (modal as HTMLElement).style.display === 'none' || modal.classList.contains('hidden');
      }, { timeout: 10000 });

      logger.info('Modal closed successfully');
      return this.createSuccess();
    } catch (error) {
      logger.warn(`Modal close verification failed: ${error}, but continuing...`);
      return this.createSuccess(); // Continue even if modal close verification fails
    }
  }

  private async fillEducationFormWithTabNavigation(modal: any, educationData: any): Promise<AutomationResult> {
    try {
      logger.info('Filling education form using Tab navigation');
      
      // Press Tab twice to skip close button and reach School field
      await this.page.keyboard.press('Tab');
      await this.randomDelay(200, 300);
      await this.page.keyboard.press('Tab');
      await this.randomDelay(1000, 1200);
      
      // Type school name and verify
      await this.typeHumanLike(educationData.school_name);
      await this.randomDelay(500, 1000);
      
      // Check if first letter was typed, if not press Tab again
      const schoolTyped = await this.checkIfFirstLetterTyped(educationData.school_name);
      if (!schoolTyped) {
        logger.info('School field not focused, pressing Tab again');
        await this.page.keyboard.press('Tab');
        await this.randomDelay(1000, 1200);
        await this.typeHumanLike(educationData.school_name);
        await this.randomDelay(500, 1000);
      }
      
      // For combobox: try down arrow and enter, then double tab to next field
      await this.handleComboboxSelection();
      await this.page.keyboard.press('Tab');
      await this.randomDelay(1000, 1200);
      await this.page.keyboard.press('Tab');
      await this.randomDelay(1000, 1200);
      
      // Type degree name and verify
      await this.typeHumanLike(educationData.degree);
      await this.randomDelay(500, 1000);
      
      // Check if first letter was typed, if not press Tab again
      const degreeTyped = await this.checkIfFirstLetterTyped(educationData.degree);
      if (!degreeTyped) {
        logger.info('Degree field not focused, pressing Tab again');
        await this.page.keyboard.press('Tab');
        await this.randomDelay(1000, 1200);
        await this.typeHumanLike(educationData.degree);
        await this.randomDelay(500, 1000);
      }
      
      // For combobox: try down arrow and enter, then double tab to next field
      await this.handleComboboxSelection();
      await this.page.keyboard.press('Tab');
      await this.randomDelay(1000, 1200);
      await this.page.keyboard.press('Tab');
      await this.randomDelay(1000, 1200);
      
      // Type field of study and verify
      await this.typeHumanLike(educationData.field_of_study);
      await this.randomDelay(500, 1000);
      
      // Check if first letter was typed, if not press Tab again
      const fieldTyped = await this.checkIfFirstLetterTyped(educationData.field_of_study);
      if (!fieldTyped) {
        logger.info('Field of study not focused, pressing Tab again');
        await this.page.keyboard.press('Tab');
        await this.randomDelay(1000, 1200);
        await this.typeHumanLike(educationData.field_of_study);
        await this.randomDelay(500, 1000);
      }
      
      // For combobox: try down arrow and enter, then double tab to next field
      await this.handleComboboxSelection();
      await this.page.keyboard.press('Tab');
      await this.randomDelay(1000, 1200);
      await this.page.keyboard.press('Tab');
      await this.randomDelay(1000, 1200);
      
      logger.info('Education form filled successfully with Tab navigation');
      return this.createSuccess();
      
    } catch (error) {
      return this.createError(
        'EDUCATION_FORM_FILL_FAILED',
        `Failed to fill education form with Tab navigation: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async checkIfFirstLetterTyped(expectedText: string): Promise<boolean> {
    try {
      // Get the currently focused element
      const focusedElement = await this.page.evaluate(() => {
        const activeEl = document.activeElement as HTMLInputElement;
        return activeEl ? activeEl.value : '';
      });
      
      // Check if the first letter of expected text is in the focused element
      const firstLetter = expectedText.charAt(0).toLowerCase();
      const hasFirstLetter = focusedElement.toLowerCase().includes(firstLetter);
      
      logger.info(`Checking if first letter was typed - Expected: "${expectedText}", Current: "${focusedElement}", Has first letter: ${hasFirstLetter}`);
      return hasFirstLetter;
    } catch (error) {
      logger.warn('Error checking if first letter was typed, assuming not typed');
      return false;
    }
  }

  private async handleComboboxSelection(): Promise<void> {
    try {
      // Wait a bit for any dropdown to appear
      await this.randomDelay(500, 1000);
      
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
}
