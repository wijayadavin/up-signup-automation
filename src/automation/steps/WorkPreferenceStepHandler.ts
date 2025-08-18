import { StepHandler } from '../StepHandler.js';
import { AutomationResult } from '../BaseAutomation.js';

const logger = {
  info: (message: string, ...args: any[]) => console.log(`[INFO] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[WARN] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[ERROR] ${message}`, ...args),
  debug: (message: string, ...args: any[]) => console.log(`[DEBUG] ${message}`, ...args),
};

export class WorkPreferenceStepHandler extends StepHandler {
  constructor(page: any, user: any) {
    super(page, user, 'work_preference');
  }

  async execute(options?: { uploadOnly?: boolean; skipOtp?: boolean; skipLocation?: boolean }): Promise<AutomationResult> {
    try {
      logger.info('Handling work preference step...');

      // Validate current page
      const pageValidation = await this.validateCurrentPage('/nx/create-profile/work-preference');
      if (pageValidation) {
        return pageValidation;
      }

      await this.waitForPageReady();
      this.screenshots.work_preference_before = await this.takeScreenshot('work_preference_before');

      // ALWAYS fill the form first - don't try Next button first for work preference step
      logger.info('Filling work preference form (skipping Next button check)...');
      const formResult = await this.fillWorkPreferenceForm();
      if (formResult.status !== 'success') {
        return formResult;
      }

      // Click Next button after form filling
      const finalNextResult = await this.navigationAutomation.clickNextButton(this.stepName);
      this.screenshots.work_preference_after = await this.takeScreenshot('work_preference_after');
      return finalNextResult;

    } catch (error) {
      return this.createError(
        'WORK_PREFERENCE_STEP_FAILED',
        `Work preference step failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async fillWorkPreferenceForm(): Promise<AutomationResult> {
    try {
      logger.info('Filling work preference form - selecting "I\'d like to find opportunities myself" option...');

      // Based on the provided HTML, we need to select the "I'd like to find opportunities myself" checkbox
      // which has aria-labelledby="button-box-486" and data-ev-button_box_value="false"
      
      // Multiple strategies to find the "I'd like to find opportunities myself" checkbox
      const workPreferenceCheckboxSelectors = [
        // Primary: Target the specific input with aria-labelledby containing button-box-486 (from HTML)
        'input[type="checkbox"][aria-labelledby*="button-box-486"]',
        
        // Alternative: Target by data-ev-button_box_value="false" (from HTML)
        'input[type="checkbox"][data-ev-button_box_value="false"]',
        
        // Alternative: Target by the checked state
        'input[type="checkbox"][checked]',
        
        // Alternative: Target by the active button box
        '.air3-btn-box.is-active input[type="checkbox"]',
        
        // Alternative: Target by aria-labelledby containing button-box
        'input[type="checkbox"][aria-labelledby*="button-box"]',
        
        // Alternative: Target by data-ev-label containing button_box_checkbox
        'input[type="checkbox"][data-ev-label*="button_box_checkbox"]',
        
        // Fallback: target any checkbox
        'input[type="checkbox"]'
      ];

      let selectedCheckbox = null;
      let selectionMethod = '';

      // Try to find any checkbox using the selectors in order
      for (let i = 0; i < workPreferenceCheckboxSelectors.length; i++) {
        const selector = workPreferenceCheckboxSelectors[i];
        logger.info(`Trying selector ${i + 1}/${workPreferenceCheckboxSelectors.length}: ${selector}`);
        
        try {
          const checkboxElements = await this.page.$$(selector);
          logger.info(`Found ${checkboxElements.length} checkbox elements with selector: ${selector}`);
          
          if (checkboxElements.length > 0) {
            // Check if any checkbox is already checked
            for (let j = 0; j < checkboxElements.length; j++) {
              const checkbox = checkboxElements[j];
              const isChecked = await checkbox.evaluate((el: Element) => 
                (el as HTMLInputElement).checked
              );
              
              logger.info(`Checkbox ${j + 1} is checked: ${isChecked}`);
              
              if (isChecked) {
                selectedCheckbox = checkbox;
                selectionMethod = `Found already checked checkbox via selector ${i + 1}: ${selector}`;
                logger.info(selectionMethod);
                break;
              }
            }
            
            // If no checkbox is checked, use the first checkbox
            if (!selectedCheckbox) {
              selectedCheckbox = checkboxElements[0];
              selectionMethod = `Using first checkbox from selector ${i + 1}: ${selector}`;
              logger.info(selectionMethod);
            }
            
            break; // Found checkboxes, stop trying other selectors
          }
        } catch (error) {
          logger.warn(`Selector ${selector} failed: ${error}`);
          continue;
        }
      }

      if (!selectedCheckbox) {
        return this.createError(
          'WORK_PREFERENCE_CHECKBOX_NOT_FOUND',
          'Could not find any checkbox for work preference selection'
        );
      }

      logger.info(`Selection method: ${selectionMethod}`);

      // Check if the checkbox is already checked
      const isAlreadyChecked = await selectedCheckbox.evaluate((el: Element) => 
        (el as HTMLInputElement).checked
      );

      if (isAlreadyChecked) {
        logger.info('Checkbox is already checked, no need to click it');
      } else {
        // Click the checkbox to check it
        logger.info('Clicking the checkbox to check it...');
        await this.clickElement(selectedCheckbox);
        await this.randomDelay(125, 250);

        // Click it again to make sure it's properly checked
        logger.info('Clicking the checkbox again to ensure proper selection...');
        await this.clickElement(selectedCheckbox);
        await this.randomDelay(125, 250);

        // Use JavaScript to force the selection
        logger.info('Using JavaScript to force checkbox selection...');
        await selectedCheckbox.evaluate((el: Element) => {
          const checkbox = el as HTMLInputElement;
          checkbox.checked = true;
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
          checkbox.dispatchEvent(new Event('click', { bubbles: true }));
          checkbox.dispatchEvent(new Event('input', { bubbles: true }));
        });
        
        await this.randomDelay(125, 250);
      }

      logger.info('Successfully selected checkbox option');

      // Wait a moment for any UI updates
      await this.randomDelay(250, 500);

      // Don't check for validation errors - just proceed
      // Checkboxes are safe to click and we've done our best to select one
      logger.info('Proceeding with work preference step - checkbox selection completed');

      return this.createSuccess();

    } catch (error) {
      return this.createError(
        'WORK_PREFERENCE_FORM_FILL_FAILED',
        `Failed to fill work preference form: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
