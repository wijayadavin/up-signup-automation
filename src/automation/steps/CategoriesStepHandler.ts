import { StepHandler } from '../StepHandler.js';
import { AutomationResult } from '../BaseAutomation.js';

const logger = {
  info: (message: string, ...args: any[]) => console.log(`[INFO] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[WARN] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[ERROR] ${message}`, ...args),
  debug: (message: string, ...args: any[]) => console.log(`[DEBUG] ${message}`, ...args),
};

export class CategoriesStepHandler extends StepHandler {
  constructor(page: any, user: any) {
    super(page, user, 'categories');
  }

  async execute(options?: { uploadOnly?: boolean; skipOtp?: boolean; skipLocation?: boolean }): Promise<AutomationResult> {
    try {
      logger.info('Handling categories step...');

      // Validate current page
      const pageValidation = await this.validateCurrentPage('/nx/create-profile/categories');
      if (pageValidation) {
        return pageValidation;
      }

      await this.waitForPageReady();
      this.screenshots.categories_before = await this.takeScreenshot('categories_before');

      // Step 1: Click the first category on the left menu
      logger.info('Looking for first category on left menu...');
      const categoryResult = await this.selectFirstCategory();
      if (categoryResult.status !== 'success') {
        return categoryResult;
      }

      // Step 2: Pause after category selection
      logger.info('Pausing after category selection...');
      await this.randomDelay(2000, 3000);

      // Step 3: Select one specialty on the right panel
      logger.info('Looking for specialties on right panel...');
      const specialtyResult = await this.selectFirstSpecialty();
      if (specialtyResult.status !== 'success') {
        return specialtyResult;
      }

      // Step 4: Click Next button
      const navigationResult = await this.navigationAutomation.clickNextButton(this.stepName);
      this.screenshots.categories_after = await this.takeScreenshot('categories_after');
      return navigationResult;

    } catch (error) {
      return this.createError(
        'CATEGORIES_STEP_FAILED',
        `Categories step failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async selectFirstCategory(): Promise<AutomationResult> {
    try {
      logger.info('Attempting to select first category...');

      // Multiple strategies to find the first category link
      const categorySelectors = [
        // Primary: Target category links with data-ev-label
        'a[data-ev-label="category_activate"]',
        
        // Alternative: Target by class
        '.air3-list-nav-link',
        
        // Alternative: Target by navigation structure
        '.categories .air3-list-nav-item a',
        
        // Alternative: Target by list structure
        '.air3-list-nav-item a',
        
        // Alternative: Target by role
        '[role="navigation"] a',
        
        // Fallback: any link in the left panel
        '.left a'
      ];

      let firstCategory = null;
      let selectionMethod = '';

      // Try to find the first category using the selectors in order
      for (let i = 0; i < categorySelectors.length; i++) {
        const selector = categorySelectors[i];
        logger.info(`Trying selector ${i + 1}/${categorySelectors.length}: ${selector}`);
        
        try {
          const categoryElements = await this.page.$$(selector);
          logger.info(`Found ${categoryElements.length} category elements with selector: ${selector}`);
          
          if (categoryElements.length > 0) {
            // Use the first category element
            firstCategory = categoryElements[0];
            const categoryText = await firstCategory.evaluate((el: Element) => 
              el.textContent?.trim() || ''
            );
            
            selectionMethod = `Found first category via selector ${i + 1}: ${selector} (text: "${categoryText}")`;
            logger.info(selectionMethod);
            break;
          }
        } catch (error) {
          logger.warn(`Selector ${selector} failed: ${error}`);
          continue;
        }
      }

      if (!firstCategory) {
        logger.warn('No category found, will try fallback navigation...');
        return this.createError('CATEGORIES_LEFT_ITEM_NOT_FOUND', 'First category not found');
      }

      logger.info(`Selection method: ${selectionMethod}`);

      // Check if already active
      const isActive = await firstCategory.evaluate((el: Element) => {
        return el.closest('.air3-list-nav-item')?.classList.contains('active') || false;
      });

      if (!isActive) {
        logger.info('Clicking first category...');
        
        // Strategy 1: Direct click
        logger.info('Strategy 1: Direct click...');
        await this.clickElement(firstCategory);
        await this.randomDelay(1000, 2000);

        // Strategy 2: JavaScript click
        logger.info('Strategy 2: JavaScript click...');
        await firstCategory.evaluate((el: Element) => {
          const link = el as HTMLAnchorElement;
          link.click();
        });
        await this.randomDelay(1000, 2000);

        logger.info('Successfully clicked first category');
      } else {
        logger.info('First category already active, skipping click...');
      }

      return this.createSuccess();

    } catch (error) {
      logger.warn(`Failed to select first category: ${error}, will try fallback navigation...`);
      return this.createError('CATEGORIES_LEFT_ITEM_NOT_FOUND', `Failed to select first category: ${error}`);
    }
  }

  private async selectFirstSpecialty(): Promise<AutomationResult> {
    try {
      logger.info('Attempting to select first specialty...');

      // Multiple strategies to find the first specialty checkbox
      const specialtySelectors = [
        // Primary: Target checkbox labels with data-test
        'label[data-test="checkbox-label"]',
        
        // Alternative: Target by class
        '.air3-checkbox-label',
        
        // Alternative: Target checkboxes directly
        'input[type="checkbox"]',
        
        // Alternative: Target by fieldset structure
        'fieldset label',
        
        // Alternative: Target by right panel
        '.right label',
        
        // Alternative: Target by specialties container
        '.specialties label',
        
        // Fallback: any checkbox in the right panel
        '.right input[type="checkbox"]'
      ];

      let firstSpecialty = null;
      let selectionMethod = '';

      // Try to find the first specialty using the selectors in order
      for (let i = 0; i < specialtySelectors.length; i++) {
        const selector = specialtySelectors[i];
        logger.info(`Trying selector ${i + 1}/${specialtySelectors.length}: ${selector}`);
        
        try {
          const specialtyElements = await this.page.$$(selector);
          logger.info(`Found ${specialtyElements.length} specialty elements with selector: ${selector}`);
          
          if (specialtyElements.length > 0) {
            // Use the first specialty element
            firstSpecialty = specialtyElements[0];
            const specialtyText = await firstSpecialty.evaluate((el: Element) => 
              el.textContent?.trim() || ''
            );
            
            selectionMethod = `Found first specialty via selector ${i + 1}: ${selector} (text: "${specialtyText}")`;
            logger.info(selectionMethod);
            break;
          }
        } catch (error) {
          logger.warn(`Selector ${selector} failed: ${error}`);
          continue;
        }
      }

      if (!firstSpecialty) {
        logger.warn('No specialty found, will try fallback navigation...');
        return this.createError('CATEGORIES_RIGHT_CHECKBOX_NOT_FOUND', 'First specialty not found');
      }

      logger.info(`Selection method: ${selectionMethod}`);

      // Check if already selected
      const isChecked = await firstSpecialty.evaluate((el: Element) => {
        // If it's a label element, find the input within it
        if (el.tagName.toLowerCase() === 'label') {
          const input = el.querySelector('input[type="checkbox"]') as HTMLInputElement;
          return input ? input.checked : false;
        }
        // If it's an input element
        else if (el.tagName.toLowerCase() === 'input') {
          return (el as HTMLInputElement).checked;
        }
        return false;
      });

      if (!isChecked) {
        logger.info('First specialty not checked, clicking to select...');
        
        // Strategy 1: Direct click
        logger.info('Strategy 1: Direct click...');
        await this.clickElement(firstSpecialty);
        await this.randomDelay(1000, 2000);

        // Strategy 2: JavaScript click
        logger.info('Strategy 2: JavaScript click...');
        await firstSpecialty.evaluate((el: Element) => {
          if (el.tagName.toLowerCase() === 'label') {
            const input = el.querySelector('input[type="checkbox"]') as HTMLInputElement;
            if (input) {
              input.checked = true;
              input.dispatchEvent(new Event('change', { bubbles: true }));
            }
          } else if (el.tagName.toLowerCase() === 'input') {
            const input = el as HTMLInputElement;
            input.checked = true;
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
        await this.randomDelay(1000, 2000);

        logger.info('Successfully clicked first specialty');
      } else {
        logger.info('First specialty already checked, skipping...');
      }

      return this.createSuccess();

    } catch (error) {
      logger.warn(`Failed to select first specialty: ${error}, will try fallback navigation...`);
      return this.createError('CATEGORIES_RIGHT_CHECKBOX_NOT_FOUND', `Failed to select first specialty: ${error}`);
    }
  }
}
