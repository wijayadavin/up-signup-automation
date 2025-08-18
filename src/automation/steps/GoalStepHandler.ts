import { StepHandler } from '../StepHandler.js';
import { AutomationResult } from '../BaseAutomation.js';

const logger = {
  info: (message: string, ...args: any[]) => console.log(`[INFO] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[WARN] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[ERROR] ${message}`, ...args),
  debug: (message: string, ...args: any[]) => console.log(`[DEBUG] ${message}`, ...args),
};

export class GoalStepHandler extends StepHandler {
  constructor(page: any, user: any) {
    super(page, user, 'goal');
  }

  async execute(options?: { uploadOnly?: boolean; skipOtp?: boolean; skipLocation?: boolean }): Promise<AutomationResult> {
    try {
      logger.info('Handling goal step...');

      // Validate current page
      const pageValidation = await this.validateCurrentPage('/nx/create-profile/goal');
      if (pageValidation) {
        return pageValidation;
      }

      await this.waitForPageReady();
      this.screenshots.goal_before = await this.takeScreenshot('goal_before');

      // ALWAYS fill the form first - don't try Next button first for goal step
      logger.info('Filling goal form (skipping Next button check)...');
      const formResult = await this.fillGoalForm();
      if (formResult.status !== 'success') {
        return formResult;
      }

      // Click Next button after form filling
      const finalNextResult = await this.navigationAutomation.clickNextButton(this.stepName);
      this.screenshots.goal_after = await this.takeScreenshot('goal_after');
      return finalNextResult;

    } catch (error) {
      return this.createError(
        'GOAL_STEP_FAILED',
        `Goal step failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async fillGoalForm(): Promise<AutomationResult> {
    try {
      logger.info('Filling goal form - selecting "I don\'t have a goal in mind yet" option...');

      // Based on the provided HTML, we need to select the "I don't have a goal in mind yet" radio button
      // which has value="EXPLORING" and aria-labelledby="button-box-484"
      
      // Multiple strategies to find the "I don't have a goal in mind yet" radio button
      const goalRadioSelectors = [
        // Primary: Target the specific input with value="EXPLORING" 
        'input[type="radio"][value="EXPLORING"]',
        
        // Alternative: Target by aria-labelledby containing button-box-484 (from HTML)
        'input[type="radio"][aria-labelledby*="button-box-484"]',
        
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
      for (let i = 0; i < goalRadioSelectors.length; i++) {
        const selector = goalRadioSelectors[i];
        logger.info(`Trying selector ${i + 1}/${goalRadioSelectors.length}: ${selector}`);
        
        try {
          const radioElements = await this.page.$$(selector);
          logger.info(`Found ${radioElements.length} radio elements with selector: ${selector}`);
          
          if (radioElements.length > 0) {
            // Prioritize the "EXPLORING" option if we can find it
            for (let j = 0; j < radioElements.length; j++) {
              const radio = radioElements[j];
              const value = await radio.evaluate((el: Element) => 
                (el as HTMLInputElement).value
              );
              
              logger.info(`Radio ${j + 1} has value: ${value}`);
              
              if (value === 'EXPLORING') {
                selectedRadio = radio;
                selectionMethod = `Found EXPLORING via selector ${i + 1}: ${selector}`;
                logger.info(selectionMethod);
                break;
              }
            }
            
            // If no EXPLORING found, use the first radio button
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
          'GOAL_RADIO_NOT_FOUND',
          'Could not find any radio button for goal selection'
        );
      }

      logger.info(`Selection method: ${selectionMethod}`);

      // ALWAYS click the radio button regardless of current state
      // This ensures the selection is properly registered
      logger.info('Clicking the radio button to ensure selection...');
      await this.clickElement(selectedRadio);
      await this.randomDelay(500, 1000);

      // Click it again to make sure it's properly selected
      logger.info('Clicking the radio button again to ensure proper selection...');
      await this.clickElement(selectedRadio);
      await this.randomDelay(500, 1000);

      // Use JavaScript to force the selection
      logger.info('Using JavaScript to force radio button selection...');
      await selectedRadio.evaluate((el: Element) => {
        const radio = el as HTMLInputElement;
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        radio.dispatchEvent(new Event('click', { bubbles: true }));
        radio.dispatchEvent(new Event('input', { bubbles: true }));
      });
      
      await this.randomDelay(500, 1000);

      logger.info('Successfully selected radio button option');

      // Wait a moment for any UI updates
      await this.randomDelay(1000, 2000);

      // Don't check for validation errors - just proceed
      // Radio buttons are safe to click and we've done our best to select one
      logger.info('Proceeding with goal step - radio button selection completed');

      return this.createSuccess();

    } catch (error) {
      return this.createError(
        'GOAL_FORM_FILL_FAILED',
        `Failed to fill goal form: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
