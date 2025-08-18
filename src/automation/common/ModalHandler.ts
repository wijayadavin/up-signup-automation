import { Page } from 'puppeteer';
import { AutomationResult } from '../BaseAutomation.js';

const logger = {
  info: (message: string, ...args: any[]) => console.log(`[INFO] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[WARN] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[ERROR] ${message}`, ...args),
  debug: (message: string, ...args: any[]) => console.log(`[DEBUG] ${message}`, ...args),
};

export class ModalHandler {
  protected page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  protected async waitForSelectorWithRetry(selectors: string[], timeout: number): Promise<any | null> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      for (const selector of selectors) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            logger.debug(`Found element with selector: ${selector}`);
            return element;
          }
        } catch (error) {
          // Continue to next selector
        }
      }
      await this.randomDelay(500, 1000);
    }
    
    logger.warn(`No element found with selectors: ${selectors.join(', ')}`);
    return null;
  }

  protected async randomDelay(min: number, max: number): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  protected createError(errorCode: string, evidence: string, stage: string = 'automation'): AutomationResult {
    return {
      status: 'soft_fail',
      stage,
      error_code: errorCode,
      url: this.page.url(),
      evidence,
    };
  }

  protected createSuccess(stage: string = 'automation'): AutomationResult {
    return {
      status: 'success',
      stage,
      url: this.page.url(),
    };
  }

  public async openModalWithRetry(
    buttonSelectors: string[],
    modalSelectors: string[],
    expectedTitle: string,
    errorPrefix: string,
    maxAttempts: number = 3
  ): Promise<AutomationResult> {
    try {
      // Find and click the add button
      const addButton = await this.waitForSelectorWithRetry(buttonSelectors, 15000);

      if (!addButton) {
        return this.createError(
          `${errorPrefix}_ADD_BUTTON_NOT_FOUND`,
          'Add button not found'
        );
      }

      // Get button details for logging
      const buttonDetails = await addButton.evaluate((el: Element) => ({
        text: el.textContent?.trim() || '',
        attributes: {
          'data-qa': el.getAttribute('data-qa'),
          'data-ev-label': el.getAttribute('data-ev-label'),
          'aria-labelledby': el.getAttribute('aria-labelledby'),
          class: el.getAttribute('class')
        },
        isVisible: window.getComputedStyle(el).display !== 'none' && window.getComputedStyle(el).visibility !== 'hidden',
        parentClass: el.parentElement?.getAttribute('class') || ''
      }));
      
      logger.info('Found Add button:', buttonDetails);

      // Verify button is clickable
      const isClickable = await addButton.evaluate((el: Element) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });

      if (!isClickable) {
        logger.warn('Button might not be clickable (zero size)');
      }

      if (!buttonDetails.isVisible) {
        logger.warn('Button might be hidden');
      }

      // Click the button
      logger.info('Clicking Add button...');
      await addButton.click();
      await this.randomDelay(700, 1000);
      
      logger.info('Add button clicked, waiting for modal...');

      // Wait for modal to appear with retries
      let modalOpened = false;
      let attempt = 1;

      while (attempt <= maxAttempts) {
        logger.info(`Attempt ${attempt}/${maxAttempts} to verify modal...`);

        // Check for the specific modal content
        const modalContent = await this.waitForSelectorWithRetry(modalSelectors, 5000);

        if (modalContent) {
          // Verify it's the right modal by checking the title
          const modalTitle = await this.page.$('h2.air3-modal-title');
          const titleText = await modalTitle?.evaluate(el => el.textContent?.trim());
          
          if (titleText === expectedTitle) {
            logger.info('Modal verified with correct title');
            modalOpened = true;
            break;
          }
        }

        if (attempt < maxAttempts) {
          logger.warn('Modal not found or incorrect, retrying...');
          await this.randomDelay(700, 1000);
          
          // Try clicking the add button again
          const addButton = await this.waitForSelectorWithRetry(buttonSelectors, 5000);

          if (addButton) {
            await addButton.click();
            await this.randomDelay(700, 1000);
          }
        }

        attempt++;
      }

      if (!modalOpened) {
        return this.createError(
          `${errorPrefix}_MODAL_NOT_VISIBLE`,
          `Modal did not appear after ${maxAttempts} attempts`
        );
      }

      logger.info('Modal opened successfully');
      return this.createSuccess();

    } catch (error) {
      return this.createError(
        `${errorPrefix}_MODAL_OPEN_FAILED`,
        `Failed to open modal: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  public async waitForModalClose(
    modalSelectors: string[],
    maxAttempts: number = 5,
    errorPrefix: string
  ): Promise<AutomationResult> {
    try {
      let modalClosed = false;
      let closeAttempts = 0;

      while (closeAttempts < maxAttempts) {
        logger.info(`Attempt ${closeAttempts + 1}/${maxAttempts} to verify modal closed...`);
        const modalStillOpen = await this.page.$(`${modalSelectors.join(', ')}`);
        
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
        return this.createError(
          `${errorPrefix}_MODAL_CLOSE_FAILED`,
          'Modal did not close after saving'
        );
      }

      return this.createSuccess();
    } catch (error) {
      return this.createError(
        `${errorPrefix}_MODAL_CLOSE_CHECK_FAILED`,
        `Failed to verify modal close: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
