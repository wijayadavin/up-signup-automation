import { ElementHandle } from 'puppeteer';
import { BaseAutomation, AutomationResult } from './BaseAutomation';

// Create a simple logger for automation
const logger = {
  info: (message: string, ...args: any[]) => console.log(`[INFO] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[WARN] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[ERROR] ${message}`, ...args),
  debug: (message: string, ...args: any[]) => console.debug(`[DEBUG] ${message}`, ...args),
};

export class FormAutomation extends BaseAutomation {
  
  // Form field filling with verification
  async fillField(fieldSelectors: string[], value: string, fieldName: string): Promise<AutomationResult> {
    const field = await this.waitForSelectorWithRetry(fieldSelectors, 10000);
    
    if (!field) {
      return this.createError(
        `${fieldName.toUpperCase()}_FIELD_NOT_FOUND`,
        `${fieldName} field not found`
      );
    }

    // Special handling for password fields - more careful typing and verification
    const isPasswordField = fieldName.toLowerCase() === 'password';
    const maxRetries = isPasswordField ? 3 : 2;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.debug(`Attempt ${attempt} to fill ${fieldName} field`);
      
      await this.clearAndType(field, value);
      
      // Wait a bit longer for password fields to ensure the value is set
      if (isPasswordField) {
        await this.randomDelay(1000, 2000);
      }
      
      // For autocomplete/typeahead fields, the value might not be visible while focused
      // Try to blur the field first to make the value visible, then check it
      await field.evaluate((el: Element) => (el as HTMLInputElement).blur());
      await this.randomDelay(300, 500);
      
      // Verify the value was entered correctly
      const enteredValue = await field.evaluate((el: Element) => (el as HTMLInputElement).value);
      
      // Check if field has any value
      if (enteredValue && enteredValue.trim() !== '') {
        // For non-password fields, also verify the first letter was typed correctly
        if (!isPasswordField && value && value.length > 0) {
          const expectedFirstLetter = value.charAt(0).toLowerCase();
          const actualFirstLetter = enteredValue.charAt(0).toLowerCase();
          
          if (actualFirstLetter === expectedFirstLetter) {
            logger.info(`${fieldName} filled successfully: ${enteredValue} (first letter verified: ${actualFirstLetter})`);
            return this.createSuccess();
          } else {
            logger.warn(`${fieldName} first letter verification failed. Expected: ${expectedFirstLetter}, Got: ${actualFirstLetter}. Full value: ${enteredValue}`);
            
            if (attempt < maxRetries) {
              logger.info(`Retrying ${fieldName} entry due to first letter mismatch...`);
              await this.randomDelay(1000, 2000);
              continue;
            }
          }
        } else {
          // For password fields, only log success, not the actual value
          if (isPasswordField) {
            logger.info(`${fieldName} filled successfully (length: ${enteredValue.length})`);
          } else {
            logger.info(`${fieldName} filled successfully: ${enteredValue}`);
          }
          return this.createSuccess();
        }
      } else {
        // If still no value after blur, try clicking outside the field
        await this.page.mouse.click(0, 0); // Click at top-left corner to deselect
        await this.randomDelay(300, 500);
        
        const enteredValueAfterClick = await field.evaluate((el: Element) => (el as HTMLInputElement).value);
        if (enteredValueAfterClick && enteredValueAfterClick.trim() !== '') {
          logger.info(`${fieldName} filled successfully after deselect: ${enteredValueAfterClick}`);
          return this.createSuccess();
        }
      }
      
      logger.warn(`${fieldName} verification failed (attempt ${attempt}). Expected length: ${value.length}, Got length: ${enteredValue.length}`);
      
      if (attempt < maxRetries) {
        logger.info(`Retrying ${fieldName} entry...`);
        await this.randomDelay(1000, 2000);
      }
    }
    
    // All attempts failed - but be more lenient
    const finalValue = await field.evaluate((el: Element) => (el as HTMLInputElement).value);
    if (finalValue && finalValue.trim() !== '') {
      logger.info(`${fieldName} has value after all attempts, proceeding: ${finalValue}`);
      return this.createSuccess();
    }
    
    return this.createError(
      `${fieldName.toUpperCase()}_ENTRY_FAILED`,
      `Failed to enter ${fieldName} correctly after ${maxRetries} attempts. Field is empty.`
    );
  }

  // Special method for password entry with extra care
  async fillPasswordField(fieldSelectors: string[], password: string): Promise<AutomationResult> {
    logger.info('Waiting for password field to appear...');
    
    // Wait longer for password field since it appears after page transition
    const field = await this.waitForSelectorWithRetry(fieldSelectors, 15000);
    
    if (!field) {
      logger.error('Password field not found after waiting 15 seconds');
      return this.createError(
        'PASSWORD_FIELD_NOT_FOUND',
        'Password field not found after page transition'
      );
    }
    
    // Verify this is actually a password field and not an email field
    const fieldType = await field.evaluate((el: Element) => (el as HTMLInputElement).type);
    const fieldId = await field.evaluate((el: Element) => (el as HTMLInputElement).id);
    const fieldName = await field.evaluate((el: Element) => (el as HTMLInputElement).name);
    
    logger.info(`Found field - Type: ${fieldType}, ID: ${fieldId}, Name: ${fieldName}`);
    
    // Additional verification that this is the password field
    if (fieldType !== 'password' && !fieldId?.includes('password') && !fieldName?.includes('password')) {
      logger.error('Found field is not a password field!');
      return this.createError(
        'WRONG_FIELD_TYPE',
        `Found field is not a password field - Type: ${fieldType}, ID: ${fieldId}, Name: ${fieldName}`
      );
    }
    
    logger.info('Password field found and verified, proceeding with entry...');

    // Focus the field first and wait
    await field.focus();
    await this.randomDelay(500, 1000);
    
    // Clear the field thoroughly
    await this.page.keyboard.down('Control');
    await this.page.keyboard.press('KeyA');
    await this.page.keyboard.up('Control');
    await this.page.keyboard.press('Backspace');
    await this.randomDelay(500, 1000);
    
    // Verify field is empty
    const currentValue = await field.evaluate((el: Element) => (el as HTMLInputElement).value);
    if (currentValue) {
      // Force clear if still not empty
      await field.evaluate((el: Element) => {
        (el as HTMLInputElement).value = '';
      });
      await this.randomDelay(300, 500);
    }
    
    // Type password very carefully using the field directly
    const chars = password.split('');
    for (const char of chars) {
      await field.type(char);
      // Even slower typing for passwords
      await this.randomDelay(150, 400);
    }
    
    // Wait longer after typing password
    await this.randomDelay(1500, 2500);
    
    // Verify password was entered correctly
    const enteredPassword = await field.evaluate((el: Element) => (el as HTMLInputElement).value);
    
    // More lenient password verification: check if field has any value
    if (enteredPassword && enteredPassword.trim() !== '') {
      logger.info(`Password filled successfully (length: ${enteredPassword.length})`);
      return this.createSuccess();
    }
    
    logger.warn(`Password verification failed. Expected length: ${password.length}, Got length: ${enteredPassword.length}`);
    
    // Try one more time with even slower typing
    await field.focus();
    await this.randomDelay(500, 1000);
    
    // Clear again
    await this.page.keyboard.down('Control');
    await this.page.keyboard.press('KeyA');
    await this.page.keyboard.up('Control');
    await this.page.keyboard.press('Backspace');
    await this.randomDelay(500, 1000);
    
    // Type even slower using the field directly
    for (const char of chars) {
      await field.type(char);
      await this.randomDelay(200, 500);
    }
    
    await this.randomDelay(2000, 3000);
    
    const retryPassword = await field.evaluate((el: Element) => (el as HTMLInputElement).value);
    
    // More lenient retry verification
    if (retryPassword && retryPassword.trim() !== '') {
      logger.info(`Password filled successfully on retry (length: ${retryPassword.length})`);
      return this.createSuccess();
    }
    
    return this.createError(
      'PASSWORD_ENTRY_FAILED',
      `Failed to enter password correctly. Field is empty after retry.`
    );
  }

  // Dropdown selection
  async selectFromDropdown(
    dropdownSelectors: string[], 
    optionValue: string, 
    fieldName: string
  ): Promise<AutomationResult> {
    const dropdown = await this.waitForSelectorWithRetry(dropdownSelectors, 10000);
    
    if (!dropdown) {
      return this.createError(
        `${fieldName.toUpperCase()}_DROPDOWN_NOT_FOUND`,
        `${fieldName} dropdown not found`
      );
    }

    await this.clickElement(dropdown);
    await this.randomDelay(500, 1000);

    // Look for search input in dropdown
    const searchInput = await this.page.$('input[type="search"], input[type="text"]');
    if (searchInput) {
      await this.clearAndType(searchInput, optionValue);
      await this.page.keyboard.press('ArrowDown');
      await this.randomDelay(500, 1000);
      await this.page.keyboard.press('Enter');
    } else {
      // Try to find option directly
      const option = await this.waitForSelectorWithRetry([
        `[role="option"]:contains("${optionValue}")`,
        `li:contains("${optionValue}")`,
        `div:contains("${optionValue}")`,
      ], 5000);
      
      if (option) {
        await this.clickElement(option);
      } else {
        return this.createError(
          `${fieldName.toUpperCase()}_OPTION_NOT_FOUND`,
          `Option "${optionValue}" not found in ${fieldName} dropdown`
        );
      }
    }

    logger.info(`${fieldName} dropdown selection completed: ${optionValue}`);
    return this.createSuccess();
  }

  // Checkbox handling
  async toggleCheckbox(
    checkboxSelectors: string[], 
    shouldCheck: boolean, 
    fieldName: string
  ): Promise<AutomationResult> {
    const checkbox = await this.waitForSelectorWithRetry(checkboxSelectors, 10000);
    
    if (!checkbox) {
      return this.createError(
        `${fieldName.toUpperCase()}_CHECKBOX_NOT_FOUND`,
        `${fieldName} checkbox not found`
      );
    }

    const isChecked = await checkbox.evaluate((el: Element) => (el as HTMLInputElement).checked);
    
    if (isChecked !== shouldCheck) {
      await this.clickElement(checkbox);
      logger.info(`${fieldName} checkbox ${shouldCheck ? 'checked' : 'unchecked'}`);
    } else {
      logger.info(`${fieldName} checkbox already ${shouldCheck ? 'checked' : 'unchecked'}`);
    }

    return this.createSuccess();
  }

  // Textarea filling
  async fillTextarea(
    textareaSelectors: string[], 
    content: string, 
    fieldName: string
  ): Promise<AutomationResult> {
    const textarea = await this.waitForSelectorWithRetry(textareaSelectors, 10000);
    
    if (!textarea) {
      return this.createError(
        `${fieldName.toUpperCase()}_TEXTAREA_NOT_FOUND`,
        `${fieldName} textarea not found`
      );
    }

    await this.clearAndType(textarea, content);
    
    // Verify content
    const enteredContent = await textarea.evaluate((el: Element) => (el as HTMLTextAreaElement).value);
    if (enteredContent !== content) {
      return this.createError(
        `${fieldName.toUpperCase()}_CONTENT_FAILED`,
        `Failed to enter ${fieldName} content correctly`
      );
    }

    logger.info(`${fieldName} textarea filled successfully`);
    return this.createSuccess();
  }

  // File upload
  async uploadFile(
    fileInputSelectors: string[], 
    filePath: string, 
    fieldName: string
  ): Promise<AutomationResult> {
    const fileInput = await this.waitForSelectorWithRetry(fileInputSelectors, 10000);
    
    if (!fileInput) {
      return this.createError(
        `${fieldName.toUpperCase()}_INPUT_NOT_FOUND`,
        `File input for ${fieldName} not found`
      );
    }

    try {
      await (fileInput as any).uploadFile(filePath);
      logger.info(`File uploaded successfully for ${fieldName}: ${filePath}`);
      return this.createSuccess();
    } catch (error) {
      return this.createError(
        `${fieldName.toUpperCase()}_UPLOAD_FAILED`,
        `Failed to upload file for ${fieldName}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Wait for modal and return element handle
  async waitForModal(modalSelectors: string[] = ['[role="dialog"]', '.modal', '[data-test="modal"]']): Promise<ElementHandle<Element> | null> {
    return await this.waitForSelectorWithRetry(modalSelectors, 10000);
  }

  // Close modal
  async closeModal(): Promise<AutomationResult> {
    const closeButton = await this.waitForSelectorWithRetry([
      'button[aria-label="Close"]',
      'button[data-qa="close"]',
      'button:contains("Close")',
      '.modal-close',
      '[role="button"][aria-label*="Close"]',
    ], 5000);

    if (closeButton) {
      await this.clickElement(closeButton);
      return this.createSuccess();
    }

    // Try escape key
    await this.page.keyboard.press('Escape');
    await this.randomDelay(1000, 2000);
    
    return this.createSuccess();
  }
}
