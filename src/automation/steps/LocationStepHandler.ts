import { Page } from 'puppeteer';
import { User } from '../../types/database';
import { StepHandler } from '../StepHandler';
import { AutomationResult } from '../BaseAutomation';
import path from 'path';
import fs from 'fs';

// Create a simple logger for automation
const logger = {
  info: (message: string, ...args: any[]) => console.log(`[INFO] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[WARN] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[ERROR] ${message}`, ...args),
  debug: (message: string, ...args: any[]) => console.debug(`[DEBUG] ${message}`, ...args),
};

export class LocationStepHandler extends StepHandler {
  constructor(page: Page, user: User) {
    super(page, user, 'location');
  }

  async execute(): Promise<AutomationResult> {
    try {
      logger.info('Handling location step...');
      
      // Validate current page
      const pageValidation = await this.validateCurrentPage('/nx/create-profile/location');
      if (pageValidation) {
        return pageValidation;
      }

      await this.waitForPageReady();
      this.screenshots.location_before = await this.takeScreenshot('location_before');

      // Fill date of birth
      const dobResult = await this.fillDateOfBirth();
      if (dobResult.status !== 'success') {
        return dobResult;
      }

      // Fill address information
      const addressResult = await this.fillAddressInformation();
      if (addressResult.status !== 'success') {
        return addressResult;
      }

      // Fill phone number
      const phoneResult = await this.fillPhoneNumber();
      if (phoneResult.status !== 'success') {
        return phoneResult;
      }

      // Upload profile photo
      const photoResult = await this.uploadProfilePhoto();
      if (photoResult.status !== 'success') {
        return photoResult;
      }

      // Take screenshot after filling all fields
      this.screenshots.location_after = await this.takeScreenshot('location_after');

      // Try to find and click the "Review your profile" button or Next button
      const nextButton = await this.waitForSelectorWithRetry([
        'button:contains("Review your profile")',
        '[data-test="next-button"]',
        'button[type="submit"]',
        '.air3-btn-primary',
      ], 5000);

      if (nextButton) {
        await this.clickElement(nextButton);
        logger.info('Next button clicked, waiting for phone verification modal...');
        
        // Wait for phone verification modal to appear
        const phoneVerificationResult = await this.handlePhoneVerificationModal();
        if (phoneVerificationResult.status !== 'success') {
          return phoneVerificationResult;
        }
        
        logger.info('Location step completed successfully with phone verification');
        return this.createSuccess();
      } else {
        logger.warn('Could not find next button on location step');
        return this.createError('LOCATION_NEXT_BUTTON_NOT_FOUND', 'Could not find next button after filling location information');
      }

    } catch (error) {
      return this.createError('LOCATION_STEP_FAILED', `Location step failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async fillDateOfBirth(): Promise<AutomationResult> {
    try {
      logger.info('Filling date of birth...');

      // Look for the date picker input
      const dobInput = await this.waitForSelectorWithRetry([
        '[data-test="input"][placeholder="mm/dd/yyyy"]',
        '[aria-labelledby*="date-of-birth"]',
        '.air3-datepicker input',
        'input[placeholder="mm/dd/yyyy"]'
      ], 5000);

      if (!dobInput) {
        return this.createError('DOB_FIELD_NOT_FOUND', 'Date of birth field not found');
      }

      // Use user's birth date if available, otherwise use a default
      let birthDate = '01/15/1990'; // Default date
      if (this.user.birth_date) {
        const date = new Date(this.user.birth_date);
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const year = date.getFullYear().toString();
        birthDate = `${month}/${day}/${year}`;
      }

      logger.info(`Setting date of birth to: ${birthDate}`);
      
      // Clear and type the date
      await this.clearAndType(dobInput, birthDate);
      
      // Verify the date was entered
      const enteredDate = await dobInput.evaluate((el: Element) => (el as HTMLInputElement).value);
      if (enteredDate !== birthDate) {
        logger.warn(`Date verification failed. Expected: ${birthDate}, Got: ${enteredDate}`);
        // Try once more
        await this.clearAndType(dobInput, birthDate);
      }

      logger.info('Date of birth filled successfully');
      return this.createSuccess();

    } catch (error) {
      return this.createError('DOB_FILL_FAILED', `Failed to fill date of birth: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async fillAddressInformation(): Promise<AutomationResult> {
    try {
      logger.info('Filling address information...');

      // Get default address data (use user data if available, fallback to defaults)
      const addressData = {
        street: this.user.location_street_address || '123 Main Street',
        city: this.user.location_city || 'San Francisco',
        state: this.user.location_state || 'California',
        zipCode: this.user.location_post_code || '94102',
        aptSuite: '' // Optional field
      };

      // Fill street address with autocomplete handling
      const streetField = await this.waitForSelectorWithRetry([
        'input[placeholder="Enter street address"]',
        '[data-qa="input-address"] input',
        '.air3-typeahead-input-main[placeholder*="street"]',
        '.air3-typeahead-input-fake[placeholder*="street"]',
        'input[role="combobox"][placeholder*="street"]'
      ], 5000);

      if (streetField) {
        logger.info(`Filling street address: ${addressData.street}`);
        await this.clearAndType(streetField, addressData.street);
        
        // Pause a little bit after typing street address
        await this.randomDelay(2000, 3000);
        
        // Press down arrow and enter for autocomplete
        await this.page.keyboard.press('ArrowDown');
        await this.randomDelay(500, 1000);
        await this.page.keyboard.press('Enter');
        await this.randomDelay(1000, 2000);
        
        logger.info('Street address autocomplete selection completed');
      }

      // Fill apt/suite (optional)
      const aptField = await this.waitForSelectorWithRetry([
        'input[placeholder*="Apt/Suite"]',
        'input[aria-label="Apt/Suite"]'
      ], 3000);

      if (aptField && addressData.aptSuite) {
        logger.info(`Filling apt/suite: ${addressData.aptSuite}`);
        await this.clearAndType(aptField, addressData.aptSuite);
      }

      // Fill city with improved autocomplete handling (check if already filled)
      const cityField = await this.waitForSelectorWithRetry([
        'input[placeholder="Enter city"]',
        '[data-qa="input-city"] input',
        '[aria-labelledby*="city"] input',
        '.air3-typeahead-input-fake[placeholder*="city"]'
      ], 5000);

      if (cityField) {
        // Check if city field already has a value (might be autofilled from street address)
        const currentCityValue = await cityField.evaluate((el: Element) => (el as HTMLInputElement).value);
        
        if (currentCityValue && currentCityValue.trim() !== '') {
          logger.info(`City field already filled with: ${currentCityValue}, skipping city input`);
        } else {
          logger.info(`Filling city: ${addressData.city}`);
          await this.clearAndType(cityField, addressData.city);
          
          // Pause a little bit after typing city
          await this.randomDelay(2000, 3000);
          
          // Press down arrow and enter for autocomplete
          await this.page.keyboard.press('ArrowDown');
          await this.randomDelay(500, 1000);
          await this.page.keyboard.press('Enter');
          await this.randomDelay(1000, 2000);
          
          logger.info('City autocomplete selection completed');
        }
      }

      // Check if state is already filled before trying to fill it
      const stateField = await this.waitForSelectorWithRetry([
        'input[placeholder*="state"]',
        '[data-qa="address-state-input"]',
        '[aria-labelledby*="state"] input'
      ], 5000);

      if (stateField) {
        // Check if state field already has a value
        const currentStateValue = await stateField.evaluate((el: Element) => (el as HTMLInputElement).value);
        
        if (currentStateValue && currentStateValue.trim() !== '') {
          logger.info(`State field already filled with: ${currentStateValue}, skipping state input`);
        } else {
          logger.info(`Filling state: ${addressData.state}`);
          await this.clearAndType(stateField, addressData.state);
        }
      }

      // Fill ZIP/postal code
      const zipField = await this.waitForSelectorWithRetry([
        'input[placeholder*="ZIP"]',
        '[data-qa="zip"]',
        '[aria-labelledby*="postal"] input'
      ], 5000);

      if (zipField) {
        logger.info(`Filling ZIP code: ${addressData.zipCode}`);
        await this.clearAndType(zipField, addressData.zipCode);
      }

      logger.info('Address information filled successfully');
      return this.createSuccess();

    } catch (error) {
      return this.createError('ADDRESS_FILL_FAILED', `Failed to fill address information: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async handleAutocompleteDropdown(fieldName: string): Promise<void> {
    // Wait for dropdown suggestions to appear
    logger.info(`Waiting for ${fieldName} dropdown suggestions...`);
    await this.randomDelay(2000, 3000); // Wait longer for dropdown to appear
    
    // Check if dropdown is visible - look for address-specific dropdowns
    const dropdownVisible = await this.page.evaluate(() => {
      // Look for various types of dropdowns based on the HTML structure
      const dropdownSelectors = [
        '.air3-typeahead-dropdown-menu',
        '.air3-typeahead-menu-list-container',
        '.air3-menu-list',
        '[role="listbox"]',
        '.air3-typeahead-fake + div', // Address suggestions dropdown
        '[data-qa="input-address"] + div', // Address input dropdown
        '.air3-typeahead-suggestions',
        '.air3-typeahead-dropdown'
      ];
      
      return dropdownSelectors.some(selector => {
        const dropdowns = document.querySelectorAll(selector);
        return Array.from(dropdowns).some(dropdown => {
          const style = window.getComputedStyle(dropdown);
          return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        });
      });
    });
    
    if (dropdownVisible) {
      logger.info(`${fieldName} dropdown visible, selecting first option...`);
      // Wait a bit more for dropdown to fully load
      await this.randomDelay(1000, 1500);
      
      // Try to click the first option directly first
      const firstOptionClicked = await this.page.evaluate(() => {
        const menuItems = document.querySelectorAll('.air3-menu-item');
        if (menuItems.length > 0) {
          const firstItem = menuItems[0] as HTMLElement;
          firstItem.click();
          return true;
        }
        return false;
      });
      
      if (!firstOptionClicked) {
        // Fallback to keyboard navigation
        await this.page.keyboard.press('ArrowDown');
        await this.randomDelay(1000, 1500);
        await this.page.keyboard.press('Enter');
      }
      
      await this.randomDelay(1000, 1500); // Wait longer after selection
      logger.info(`${fieldName} selection completed`);
    } else {
      logger.info(`No ${fieldName} dropdown visible, continuing...`);
    }
  }

  private async uploadProfilePhoto(): Promise<AutomationResult> {
    try {
      logger.info('Uploading profile photo...');

      // Look for file input directly first (might be hidden but accessible)
      let fileInput = await this.page.$('input[type="file"]');
      
      if (!fileInput) {
        // If no file input found, try clicking the upload button to trigger it
        const uploadButton = await this.waitForSelectorWithRetry([
          'button[data-qa="open-loader"]',
          'button[data-ev-label="open_loader"]',
          '.air3-btn-secondary:contains("Upload photo")',
          'button:contains("Upload photo")'
        ], 5000);

        if (uploadButton) {
          logger.info('Clicking upload photo button to trigger file input...');
          await this.clickElement(uploadButton);
          await this.randomDelay(1000, 2000);
          
          // Look for file input again after clicking
          fileInput = await this.page.$('input[type="file"]');
        }
      }

      if (!fileInput) {
        logger.warn('File input not found, skipping photo upload');
        return this.createSuccess();
      }

      // Upload the file directly
      await this.uploadFileDirectly(fileInput);
      return this.verifyAndAttachPhoto();

    } catch (error) {
      logger.error('Profile photo upload failed:', error);
      // Don't fail the entire step if photo upload fails
      return this.createSuccess();
    }
  }

  private async uploadFileDirectly(fileInput: any): Promise<void> {
    // Get the path to the profile picture - use absolute path from project root
    const profilePicturePath = path.join(process.cwd(), 'assets/images/profile-picture.png');
    
    // Check if the file exists
    if (!fs.existsSync(profilePicturePath)) {
      logger.warn(`Profile picture not found at ${profilePicturePath}, skipping photo upload`);
      return;
    }

    logger.info(`Uploading profile picture: ${profilePicturePath}`);
    
    // Upload the file directly
    await fileInput.uploadFile(profilePicturePath);
    await this.randomDelay(3000, 5000); // Wait longer for upload to process
  }

  private async verifyAndAttachPhoto(): Promise<AutomationResult> {
    // Wait for upload to complete and look for the delete button to verify
    logger.info('Waiting for upload to complete and verifying...');
    
    const deleteButton = await this.waitForSelectorWithRetry([
      'button[data-test="delete"]',
      '.air3-image-crop-delete',
      'button:contains("Delete current Image")',
      'button:contains("Delete")',
      '[data-ev-label="image_crop_delete"]',
      '.air3-btn-link:contains("Delete")'
    ], 15000); // Wait longer for upload processing

    if (!deleteButton) {
      logger.warn('Delete button not found after upload, upload may have failed');
      // Try to check if there's any indication of successful upload
      const uploadSuccess = await this.page.evaluate(() => {
        // Look for any success indicators
        const successIndicators = [
          '.air3-image-crop-delete',
          'button:contains("Delete")',
          'img[src*="profile"]',
          '.air3-portrait-uploader img'
        ];
        return successIndicators.some(selector => document.querySelector(selector));
      });
      
      if (!uploadSuccess) {
        logger.warn('No upload success indicators found, skipping photo attachment');
        return this.createSuccess();
      }
    }

    logger.info('Photo uploaded successfully, delete button found');

    // Click the "Attach photo" button
    const attachButton = await this.waitForSelectorWithRetry([
      'button[data-qa="btn-save"]',
      'button[data-ev-label="btn_save"]',
      'button:contains("Attach photo")',
      '.air3-btn-primary:contains("Attach")',
      'button:contains("Save")',
      '.air3-btn-primary'
    ], 5000);

    if (!attachButton) {
      logger.warn('Attach photo button not found');
      return this.createSuccess(); // Continue anyway
    }

    logger.info('Clicking attach photo button...');
    await this.clickElement(attachButton);
    
    // Wait for the modal to fully close and any loading to complete
    logger.info('Waiting for photo upload modal to close...');
    await this.randomDelay(3000, 5000);
    
    // Wait for any loading indicators to disappear
    try {
      await this.page.waitForFunction(() => {
        const loadingSelectors = [
          '[data-testid="loading"]', '.loading', '.spinner', '[aria-label*="loading"]', '[aria-label*="Loading"]'
        ];
        return !loadingSelectors.some(selector => document.querySelector(selector));
      }, { timeout: 10000 });
    } catch (error) {
      logger.debug('Loading indicator wait timeout, continuing...');
    }
    
    // Wait for network idle
    try {
      await this.page.waitForNetworkIdle({ idleTime: 1000, timeout: 5000 });
    } catch (error) {
      logger.debug('Network idle timeout, continuing...');
    }
    
    await this.randomDelay(2000, 3000);

    logger.info('Profile photo upload completed successfully');
    
    return this.createSuccess();
  }

  private async fillPhoneNumber(): Promise<AutomationResult> {
    try {
      logger.info('Filling phone number...');

      // Look for the phone number input field
      const phoneField = await this.waitForSelectorWithRetry([
        '.air3-phone-number-remaining',
        'input[type="tel"]',
        'input[placeholder="Enter number"]',
        '.air3-phone-number input'
      ], 5000);

      if (!phoneField) {
        return this.createError('PHONE_FIELD_NOT_FOUND', 'Phone number field not found');
      }

      // Use user's phone if available, otherwise use default
      const phoneNumber = this.user.phone || '5550123456';
      
      // Remove any non-digit characters for phone input
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      
      logger.info(`Setting phone number: ${cleanPhone}`);
      
      // Clear and type the phone number
      await this.clearAndType(phoneField, cleanPhone);
      
      // Verify the phone was entered
      const enteredPhone = await phoneField.evaluate((el: Element) => (el as HTMLInputElement).value);
      if (enteredPhone !== cleanPhone) {
        logger.warn(`Phone verification failed. Expected: ${cleanPhone}, Got: ${enteredPhone}`);
        // Try once more
        await this.clearAndType(phoneField, cleanPhone);
      }

      logger.info('Phone number filled successfully');
      return this.createSuccess();

    } catch (error) {
      return this.createError('PHONE_FILL_FAILED', `Failed to fill phone number: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async handlePhoneVerificationModal(): Promise<AutomationResult> {
    try {
      logger.info('Waiting for phone verification modal...');
      
      // Wait for the phone verification modal to appear with multiple attempts
      let modalElement = null;
      let attempts = 0;
      const maxAttempts = 3;
      
      while (!modalElement && attempts < maxAttempts) {
        attempts++;
        logger.info(`Attempt ${attempts}/${maxAttempts} to find phone verification modal...`);
        
        // Wait for the phone verification modal to appear
        modalElement = await this.waitForSelectorWithRetry([
          'h3:contains("Please verify your phone number")',
          'h3.mb-0:contains("verify your phone number")',
          '.air3-grid-container h3:contains("verify")',
          '[data-ev-label="submit_phone"]', // Send code button
          'button#submitPhone'
        ], 10000); // Wait up to 10 seconds for modal

        if (!modalElement && attempts < maxAttempts) {
          logger.warn(`Phone verification modal not found on attempt ${attempts}, waiting and trying again...`);
          await this.randomDelay(3000, 5000);
          
          // Try clicking the Next button again if modal didn't appear
          const nextButton = await this.waitForSelectorWithRetry([
            '[data-test="next-button"]',
            'button:contains("Next")',
            '.air3-btn-primary:contains("Next")'
          ], 5000);
          
          if (nextButton) {
            logger.info('Clicking Next button again to trigger phone verification modal...');
            await this.clickElement(nextButton);
            await this.randomDelay(2000, 3000);
          }
        }
      }

      if (!modalElement) {
        logger.error('Phone verification modal not found after all attempts');
        return this.createError('PHONE_VERIFICATION_MODAL_NOT_FOUND', 'Phone verification modal not found after multiple attempts');
      }

      logger.info('Phone verification modal detected');

      // Look for the "Send code" button
      const sendCodeButton = await this.waitForSelectorWithRetry([
        'button#submitPhone',
        '[data-ev-label="submit_phone"]',
        'button:contains("Send code")',
        '.air3-btn-primary:contains("Send code")'
      ], 5000);

      if (!sendCodeButton) {
        logger.warn('Send code button not found in phone verification modal');
        return this.createError('SEND_CODE_BUTTON_NOT_FOUND', 'Could not find Send code button in phone verification modal');
      }

      logger.info('Clicking Send code button...');
      await this.clickElement(sendCodeButton);
      
      // Wait for the button to be processed
      await this.randomDelay(2000, 3000);
      
      logger.info('Send code button clicked successfully');
      
      // Now wait for the OTP input modal to appear (10 seconds as requested)
      logger.info('Waiting for OTP input modal to appear (10 seconds)...');
      await this.randomDelay(10000, 10000);
      
      // Check for the OTP input modal
      const otpModalTitle = await this.page.evaluate(() => {
        const h3Elements = document.querySelectorAll('h3');
        return Array.from(h3Elements).find(h3 => h3.textContent?.includes('Enter your code'));
      });
      
      if (!otpModalTitle) {
        logger.warn('OTP input modal not found after 10 second wait');
        return this.createError('OTP_MODAL_NOT_FOUND', 'OTP input modal not found after 10 second wait');
      }
      
      logger.info('OTP input modal detected, handling OTP input...');
      
      // Wait a bit more for the OTP modal to be fully loaded
      await this.randomDelay(2000, 3000);
      
      // Find the first OTP input field
      const firstOtpInput = await this.page.$('.pincode-input');
      if (!firstOtpInput) {
        logger.warn('OTP input field not found');
        return this.createError('OTP_FIELDS_NOT_FOUND', 'OTP input field not found');
      }
      
      logger.info('Found OTP input field, typing test code 12345...');
      
      // Focus the first field and type all 5 digits
      await firstOtpInput.focus();
      await this.randomDelay(500, 1000);
      await firstOtpInput.type('12345');
      await this.randomDelay(1000, 1500);
      
      await this.randomDelay(1000, 1500);
      
      // Click the verify button
      const verifyButton = await this.waitForSelectorWithRetry([
        'button#checkPin',
        'button[data-ev-label="check_pin"]',
        'button:contains("Verify phone number")',
        '.air3-btn-primary:contains("Verify")'
      ], 5000);
      
      if (!verifyButton) {
        logger.warn('Verify button not found');
        return this.createError('VERIFY_BUTTON_NOT_FOUND', 'Verify button not found');
      }
      
      logger.info('Clicking verify phone number button...');
      await this.clickElement(verifyButton);
      
      // Wait for verification result (10 seconds as requested)
      logger.info('Waiting 10 seconds for verification result...');
      await this.randomDelay(10000, 10000);
      
      // Check for error messages with more robust detection
      const errorMessages = await this.page.$$('.air3-form-message-error, .air3-form-message.air3-form-message-error, .error-message');
      if (errorMessages.length > 0) {
        // Check each error message for content
        for (const errorElement of errorMessages) {
          const errorText = await errorElement.evaluate((el: Element) => el.textContent);
          if (errorText && errorText.trim()) {
            logger.warn(`Phone verification error detected: ${errorText}`);
            
            // Check for specific error types
            if (errorText.toLowerCase().includes('expired')) {
              logger.warn('OTP code expired, verification failed');
              return this.createError('OTP_EXPIRED', 'OTP code expired, verification failed');
            }
            
            if (errorText.toLowerCase().includes('invalid') || errorText.toLowerCase().includes('incorrect')) {
              logger.warn('OTP code invalid/incorrect, verification failed');
              return this.createError('OTP_INVALID', 'OTP code invalid/incorrect, verification failed');
            }
            
            if (errorText.toLowerCase().includes('try again') || errorText.toLowerCase().includes('request a new one')) {
              logger.warn('OTP verification failed, need to try again');
              return this.createError('OTP_VERIFICATION_FAILED', `OTP verification failed: ${errorText}`);
            }
            
            // Generic error handling
            return this.createError('PHONE_VERIFICATION_FAILED', `Phone verification failed: ${errorText}`);
          }
        }
      }
      
      // Additional check for error state in OTP input fields
      const otpInputsWithError = await this.page.$$('.pincode-input.has-error, .pincode-input[aria-invalid="true"]');
      if (otpInputsWithError.length > 0) {
        logger.warn('OTP input fields show error state, verification likely failed');
        return this.createError('OTP_INPUT_ERROR', 'OTP input fields show error state, verification failed');
      }
      
      // Wait for modal to close after successful verification
      await this.randomDelay(2000, 3000);
      
      // Check if modal is still present
      const modalStillPresent = await this.page.evaluate(() => {
        const h3Elements = document.querySelectorAll('h3');
        return Array.from(h3Elements).find(h3 => h3.textContent?.includes('Enter your code'));
      });
      if (modalStillPresent) {
        logger.warn('Phone verification modal still present after verification');
        return this.createError('VERIFICATION_MODAL_STILL_OPEN', 'Phone verification modal still open after verification');
      }
      
      logger.info('Phone verification completed successfully');
      return this.createSuccess();

    } catch (error) {
      return this.createError('PHONE_VERIFICATION_MODAL_FAILED', `Phone verification modal handling failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

}
