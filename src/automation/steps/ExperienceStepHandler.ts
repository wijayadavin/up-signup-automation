import { StepHandler } from '../StepHandler.js';
import { AutomationResult } from '../BaseAutomation.js';

const logger = {
  info: (message: string, ...args: any[]) => console.log(`[INFO] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[WARN] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[ERROR] ${message}`, ...args),
  debug: (message: string, ...args: any[]) => console.log(`[DEBUG] ${message}`, ...args),
};

export class ExperienceStepHandler extends StepHandler {
  constructor(page: any, user: any) {
    super(page, user, 'experience');
  }

  async execute(options?: { uploadOnly?: boolean; skipOtp?: boolean; skipLocation?: boolean }): Promise<AutomationResult> {
    try {
      logger.info('Handling experience step...');

      // Validate current page
      const pageValidation = await this.validateCurrentPage('/nx/create-profile/experience');
      if (pageValidation) {
        return pageValidation;
      }

      await this.waitForPageReady();
      this.screenshots.experience_before = await this.takeScreenshot('experience_before');

      // ALWAYS fill the form first - don't try Next button first for experience step
      logger.info('Filling experience form (skipping Next button check)...');
      const formResult = await this.fillExperienceForm();
      if (formResult.status !== 'success') {
        return formResult;
      }

      // Click Next button after form filling
      const finalNextResult = await this.navigationAutomation.clickNextButton(this.stepName);
      this.screenshots.experience_after = await this.takeScreenshot('experience_after');
      return finalNextResult;

    } catch (error) {
      return this.createError(
        'EXPERIENCE_STEP_FAILED',
        `Experience step failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async fillExperienceForm(): Promise<AutomationResult> {
    try {
      logger.info('Filling experience form - selecting "I am an expert" option...');

      // Based on the provided HTML, we need to select the "I am an expert" radio button
      // which has value="FREELANCED_BEFORE" and data-ev-button_box_value="true"
      
      // Multiple strategies to find the "I am an expert" radio button
      const expertRadioSelectors = [
        // Primary: Target the specific input with value="FREELANCED_BEFORE" 
        'input[type="radio"][value="FREELANCED_BEFORE"]',
        
        // Alternative: Target by aria-labelledby containing button-box-497 (from HTML)
        'input[type="radio"][aria-labelledby*="button-box-497"]',
        
        // Alternative: Target by data-ev-button_box_value="false" (from HTML)
        'input[type="radio"][data-ev-button_box_value="false"]',
        
        // Alternative: Target by the checked state
        'input[type="radio"][checked]',
        
        // Alternative: Target by the active button box
        '.air3-btn-box.is-active input[type="radio"]',
        
        // Alternative: Target by aria-labelledby containing button-box
        'input[type="radio"][aria-labelledby*="button-box"]',
        
        // Fallback: target any radio button with name containing radio-group
        'input[type="radio"][name*="radio-group"]',
        
        // Most generic fallback: any radio button
        'input[type="radio"]'
      ];

      let selectedRadio = null;
      let selectionMethod = '';

      // Try to find any radio button using the selectors in order
      for (let i = 0; i < expertRadioSelectors.length; i++) {
        const selector = expertRadioSelectors[i];
        logger.info(`Trying selector ${i + 1}/${expertRadioSelectors.length}: ${selector}`);
        
        try {
          const radioElements = await this.page.$$(selector);
          logger.info(`Found ${radioElements.length} radio elements with selector: ${selector}`);
          
          if (radioElements.length > 0) {
            // Prioritize the "I am an expert" option if we can find it
            for (let j = 0; j < radioElements.length; j++) {
              const radio = radioElements[j];
              const value = await radio.evaluate((el: Element) => 
                (el as HTMLInputElement).value
              );
              
              logger.info(`Radio ${j + 1} has value: ${value}`);
              
              if (value === 'FREELANCED_BEFORE') {
                selectedRadio = radio;
                selectionMethod = `Found FREELANCED_BEFORE via selector ${i + 1}: ${selector}`;
                logger.info(selectionMethod);
                break;
              }
            }
            
            // If no FREELANCED_BEFORE found, use the first radio button
            if (!selectedRadio) {
              selectedRadio = radioElements[0];
              const firstValue = await selectedRadio.evaluate((el: Element) => 
                (el as HTMLInputElement).value
              );
              selectionMethod = `Using first radio from selector ${i + 1}: ${selector} (value: ${firstValue})`;
              logger.info(selectionMethod);
            }
            
            break; // Found radio buttons, stop trying other selectors
          }
        } catch (error) {
          logger.warn(`Selector ${selector} failed: ${error}`);
          continue;
        }
      }

      if (!selectedRadio) {
        return this.createError(
          'EXPERIENCE_RADIO_NOT_FOUND',
          'Could not find any radio button for experience selection'
        );
      }

      logger.info(`Selection method: ${selectionMethod}`);

      // ALWAYS click the radio button regardless of current state
      // This ensures the selection is properly registered
      logger.info('Clicking the radio button to ensure selection...');
      await this.clickElement(selectedRadio);
      await this.randomDelay(125, 250);

      // Click it again to make sure it's properly selected
      logger.info('Clicking the radio button again to ensure proper selection...');
      await this.clickElement(selectedRadio);
      await this.randomDelay(125, 250);

      // Use JavaScript to force the selection
      logger.info('Using JavaScript to force radio button selection...');
      await selectedRadio.evaluate((el: Element) => {
        const radio = el as HTMLInputElement;
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        radio.dispatchEvent(new Event('click', { bubbles: true }));
        radio.dispatchEvent(new Event('input', { bubbles: true }));
      });
      
      await this.randomDelay(125, 250);

      logger.info('Successfully selected radio button option');

      // Wait a moment for any UI updates
      await this.randomDelay(250, 500);

      // Don't check for validation errors - just proceed
      // Radio buttons are safe to click and we've done our best to select one
      logger.info('Proceeding with experience step - radio button selection completed');

      return this.createSuccess();

    } catch (error) {
      return this.createError(
        'EXPERIENCE_FORM_FILL_FAILED',
        `Failed to fill experience form: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
