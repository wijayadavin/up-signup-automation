import { Page, ElementHandle } from 'puppeteer';
import { User } from '../types/database';

// Create a simple logger for automation
const logger = {
  info: (message: string, ...args: any[]) => console.log(`[INFO] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[WARN] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[ERROR] ${message}`, ...args),
  debug: (message: string, ...args: any[]) => console.debug(`[DEBUG] ${message}`, ...args),
};

export interface AutomationResult {
  status: 'success' | 'soft_fail' | 'hard_fail';
  stage: string;
  error_code?: string;
  screenshots?: Record<string, string>;
  url: string;
  evidence?: string;
}

export class BaseAutomation {
  protected page: Page;
  protected user: User;
  protected screenshots: Record<string, string> = {};

  constructor(page: Page, user: User) {
    this.page = page;
    this.user = user;
  }

  // Screenshot utilities
  protected async takeScreenshot(name: string): Promise<string> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${name}_${timestamp}.png`;
      const path = `screenshots/${filename}`;
      await this.page.screenshot({ path, fullPage: true });
      return path;
    } catch (error) {
      logger.warn(`Failed to take screenshot ${name}:`, error);
      return '';
    }
  }

  // Wait utilities
  protected async waitForPageReady(): Promise<void> {
    try {
      // Use Puppeteer's networkidle wait with shorter timeout
      await this.page.waitForNetworkIdle({ idleTime: 100, timeout: 2000 });
    } catch (error) {
      // Fallback to timeout for compatibility
      await this.randomDelay(1000, 1500);
    }
  }

  protected async waitForSelectorWithRetry(selectors: string[], timeout: number): Promise<ElementHandle<Element> | null> {
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

  // Typing utilities
  protected async typeHumanLike(text: string): Promise<void> {
    const chars = text.split('');
    for (const char of chars) {
      await this.page.keyboard.type(char);
      // Make typing 2x slower (60-200ms instead of 30-100ms)
      await this.randomDelay(60, 200);
    }
  }

  protected async randomDelay(min: number, max: number): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  // Navigation utilities
  protected async waitForNavigation(): Promise<void> {
    try {
      logger.debug('Waiting for navigation with 15 second timeout...');
      await this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 });
      logger.debug('Navigation completed successfully');
    } catch (error) {
      // Navigation might have already completed
      logger.debug(`Navigation timeout after 15 seconds: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Finding utility (replaces invalid CSS selectors)
  protected async findButtonByText(buttonTexts: string[]): Promise<ElementHandle<any> | null> {
    try {
      const button = await this.page.evaluateHandle((texts) => {
        const buttons = document.querySelectorAll('button');
        for (const button of buttons) {
          const buttonText = button.textContent?.trim().toLowerCase();
          if (texts.some(text => buttonText?.includes(text.toLowerCase()))) {
            const rect = button.getBoundingClientRect();
            const isVisible = rect.width > 0 && rect.height > 0;
            const isEnabled = !button.hasAttribute('disabled');
            const isClickable = (button as HTMLElement).offsetParent !== null;
            
            if (isVisible && isEnabled && isClickable) {
              return button;
            }
          }
        }
        return null;
      }, buttonTexts);
      
      if (button) {
        const element = button.asElement();
        return element;
      }
      return null;
    } catch (error) {
      logger.warn(`Error finding button by text ${buttonTexts.join(', ')}:`, error);
      return null;
    }
  }

  // Robust button finding with multiple strategies
  protected async findButtonRobust(selectors: string[], buttonTexts: string[]): Promise<ElementHandle<any> | null> {
    // First try specific selectors
    for (const selector of selectors) {
      try {
        const element = await this.page.$(selector);
        if (element) {
          // Verify it's a button and is clickable
          const isClickable = await this.page.evaluate((el) => {
            const rect = el.getBoundingClientRect();
            const isVisible = rect.width > 0 && rect.height > 0;
            const isEnabled = !el.hasAttribute('disabled');
            const isClickable = (el as HTMLElement).offsetParent !== null;
            return isVisible && isEnabled && isClickable;
          }, element);
          
          if (isClickable) {
            logger.debug(`Found button with selector: ${selector}`);
            return element;
          }
        }
      } catch (error) {
        // Continue to next selector
      }
    }
    
    // Then try text-based selection
    if (buttonTexts.length > 0) {
      return await this.findButtonByText(buttonTexts);
    }
    
    return null;
  }

  // Wait for page transition after form submission
  protected async waitForPageTransition(): Promise<void> {
    logger.debug('Waiting for page transition...');
    
    // Wait for network to be idle with shorter timeout
    try {
      await this.page.waitForNetworkIdle({ idleTime: 200, timeout: 2000 });
    } catch (error) {
      logger.debug('Network idle timeout, continuing...');
    }
    
    // Additional wait to ensure page is fully loaded
    await this.randomDelay(200, 400);
  }

  // Wait for login verification to complete
  protected async waitForLoginVerification(): Promise<void> {
    logger.debug('Waiting for login verification to complete...');
    
    // Wait for any loading indicators to disappear
    try {
      // Wait for common loading indicators to disappear
      await this.page.waitForFunction(() => {
        const loadingSelectors = [
          '[data-testid="loading"]',
          '.loading',
          '.spinner',
          '[aria-label*="loading"]',
          '[aria-label*="Loading"]'
        ];
        return !loadingSelectors.some(selector => document.querySelector(selector));
      }, { timeout: 15000 });
    } catch (error) {
      logger.debug('Loading indicator wait timeout, continuing...');
    }
    
    // Wait for network to be completely idle with shorter timeout
    try {
      await this.page.waitForNetworkIdle({ idleTime: 300, timeout: 3000 });
    } catch (error) {
      logger.debug('Network idle timeout, continuing...');
    }
    
    // Additional wait for any redirects to complete
    await this.randomDelay(300, 600);
  }

  // Element interaction utilities
  protected async clickElement(element: ElementHandle<Element>): Promise<void> {
    await element.click();
    await this.randomDelay(200, 400);
  }

  protected async clearAndType(element: ElementHandle<Element>, text: string): Promise<void> {
    // Focus and clear
    await element.focus();
    await this.randomDelay(300, 500); // Wait longer for focus to be established
    
    // Clear the field more thoroughly
    await this.page.keyboard.down('Control');
    await this.page.keyboard.press('KeyA');
    await this.page.keyboard.up('Control');
    await this.page.keyboard.press('Backspace');
    await this.randomDelay(300, 500);
    
    // Verify field is empty before typing
    const currentValue = await element.evaluate((el: Element) => (el as HTMLInputElement).value);
    if (currentValue) {
      // If still not empty, try clearing again
      await element.evaluate((el: Element) => {
        (el as HTMLInputElement).value = '';
      });
      await this.randomDelay(200, 400);
    }
    
    // Type new text with slower typing
    await this.typeHumanLike(text);
    
    // Wait longer after typing to ensure the value is set
    await this.randomDelay(500, 800);
    
    // Additional verification - check if the value was actually entered
    const finalValue = await element.evaluate((el: Element) => (el as HTMLInputElement).value);
    if (!finalValue || finalValue.trim() === '') {
      logger.warn('Field appears empty after typing, trying one more time...');
      // Try typing again
      await this.typeHumanLike(text);
      await this.randomDelay(500, 800);
    }
  }

  // Error handling utilities
  protected createError(errorCode: string, evidence: string, stage: string = 'automation'): AutomationResult {
    return {
      status: 'soft_fail',
      stage,
      error_code: errorCode,
      screenshots: this.screenshots,
      url: this.page.url(),
      evidence,
    };
  }

  protected createSuccess(stage: string = 'automation'): AutomationResult {
    return {
      status: 'success',
      stage,
      screenshots: this.screenshots,
      url: this.page.url(),
    };
  }
}
