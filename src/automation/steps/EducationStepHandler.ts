import { StepHandler } from '../StepHandler.js';
import { AutomationResult } from '../BaseAutomation.js';

const logger = {
  info: (message: string, ...args: any[]) => console.log(`[INFO] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[WARN] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[ERROR] ${message}`, ...args),
  debug: (message: string, ...args: any[]) => console.log(`[DEBUG] ${message}`, ...args),
};

export class EducationStepHandler extends StepHandler {
  constructor(page: any, user: any) {
    super(page, user, 'education');
  }

  async execute(options?: { uploadOnly?: boolean; skipOtp?: boolean; skipLocation?: boolean }): Promise<AutomationResult> {
    try {
      logger.info('Handling education step...');

      // Validate current page
      const pageValidation = await this.validateCurrentPage('/nx/create-profile/education');
      if (pageValidation) {
        return pageValidation;
      }

      await this.waitForPageReady();
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

      // Step 1: Click the "Add Education" button
      logger.info('Looking for Add Education button...');
      const addButtonResult = await this.clickAddEducationButton();
      if (addButtonResult.status !== 'success') {
        return addButtonResult;
      }

      // Step 2: Wait for modal to appear and fill the form
      logger.info('Waiting for education modal...');
      const modalResult = await this.fillEducationModal();
      if (modalResult.status !== 'success') {
        return modalResult;
      }

      // Step 3: Click Save button
      logger.info('Clicking Save button...');
      const saveResult = await this.clickSaveButton();
      if (saveResult.status !== 'success') {
        return saveResult;
      }

      // Step 4: Wait for modal to close and verify
      logger.info('Waiting for modal to close...');
      const closeResult = await this.waitForModalClose();
      if (closeResult.status !== 'success') {
        return closeResult;
      }

      // Step 5: Click Next button
      const navigationResult = await this.navigationAutomation.clickNextButton(this.stepName);
      this.screenshots.education_after = await this.takeScreenshot('education_after');
      return navigationResult;

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
      ], 10000);

      if (!modal) {
        logger.warn('No education modal found, will try fallback navigation...');
        return this.createError('EDUCATION_MODAL_NOT_VISIBLE', 'Education modal did not appear');
      }

      logger.info('Education modal appeared, filling form...');
      this.screenshots.modal_before_fill = await this.takeScreenshot('modal_before_fill');

      // Education data
      const educationData = {
        school: 'Stanford University',
        degree: 'Bachelor of Science',
        field_of_study: 'Computer Science',
        year_from: '2018',
        year_to: '2022',
        description: 'Studied computer science with focus on software engineering and algorithms. Completed coursework in data structures, algorithms, software design, and web development. Participated in various coding competitions and hackathons.'
      };

      // Step 1: Fill school field
      logger.info('Filling school field...');
      const schoolResult = await this.fillSchoolField(educationData.school);
      if (schoolResult.status !== 'success') {
        return schoolResult;
      }

      // Step 2: Fill degree field
      logger.info('Filling degree field...');
      const degreeResult = await this.fillDegreeField(educationData.degree);
      if (degreeResult.status !== 'success') {
        return degreeResult;
      }

      // Step 3: Fill field of study
      logger.info('Filling field of study...');
      const fieldResult = await this.fillFieldOfStudyField(educationData.field_of_study);
      if (fieldResult.status !== 'success') {
        return fieldResult;
      }

      // Step 4: Fill dates attended
      logger.info('Filling dates attended...');
      const datesResult = await this.fillDatesAttended(educationData.year_from, educationData.year_to);
      if (datesResult.status !== 'success') {
        return datesResult;
      }

      // Step 5: Fill description
      logger.info('Filling description field...');
      const descriptionResult = await this.fillDescriptionField(educationData.description);
      if (descriptionResult.status !== 'success') {
        return descriptionResult;
      }

      logger.info('Education modal filled successfully');
      return this.createSuccess();

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
      ], 10000);

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
      ], 10000);

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
      ], 10000);

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
      ], 10000);

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
      ], 10000);

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
      ], 10000);

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
      ], 10000);

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
}
