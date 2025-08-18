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
      await this.randomDelay(30, 100);
    }
  }

  protected async randomDelay(min: number, max: number): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  // Navigation utilities
  protected async waitForNavigation(): Promise<void> {
    try {
      await this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 });
    } catch (error) {
      // Navigation might have already completed
      logger.debug('Navigation timeout, continuing...');
    }
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
    await this.randomDelay(500, 1000);
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
    await this.randomDelay(1000, 2000);
  }

  // Element interaction utilities
  protected async clickElement(element: ElementHandle<Element>): Promise<void> {
    await element.click();
    await this.randomDelay(500, 1000);
  }

  protected async clearAndType(element: ElementHandle<Element>, text: string): Promise<void> {
    // Focus and clear
    await element.focus();
    await this.randomDelay(300, 500); // Wait for focus to be established
    
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
      await this.randomDelay(200, 300);
    }
    
    // Type new text
    await this.typeHumanLike(text);
    
    // Wait a bit after typing to ensure the value is set
    await this.randomDelay(500, 1000);
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
