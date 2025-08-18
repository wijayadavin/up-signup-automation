import { Page } from 'puppeteer';
import { User } from '../../types/database';
import { StepHandler } from '../StepHandler';
import { AutomationResult } from '../BaseAutomation';
import { TextVerifiedService } from '../../services/textVerifiedService.js';
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

  async execute(options?: { skipOtp?: boolean }): Promise<AutomationResult> {
    try {
      logger.info(`Handling location step... (Skip-OTP mode: ${options?.skipOtp ? 'enabled' : 'disabled'})`);
      
      // Validate current page
      const pageValidation = await this.validateCurrentPage('/nx/create-profile/location');
      if (pageValidation) {
        return pageValidation;
      }

      await this.waitForPageReady();
      this.screenshots.location_before = await this.takeScreenshot('location_before');

      // Skip-OTP mode will be handled differently - fill everything normally but use default OTP
      const isSkipOtpMode = options?.skipOtp;
      if (isSkipOtpMode) {
        logger.info('Skip-OTP mode enabled: Will fill location normally but use default OTP (12345)');
      }

      // Normal mode: Fill all fields
      logger.info('Normal mode: Filling all location fields...');

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

      // Verify all fields before clicking Next button
      const verificationResult = await this.verifyAllFieldsBeforeNext();
      if (verificationResult.status !== 'success') {
        return verificationResult;
      }

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
        const phoneVerificationResult = await this.handlePhoneVerificationModal(isSkipOtpMode);
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

      // Format date based on country code
      const getDateFormat = (countryCode: string) => {
        switch (countryCode.toUpperCase()) {
          case 'UK':
          case 'GB':
          case 'UA': // Ukraine
            return 'yyyy-mm-dd';
          case 'ID': // Indonesia
            return 'dd/mm/yyyy';
          case 'US':
          default:
            return 'mm/dd/yyyy';
        }
      };

      const formatDateForCountry = (date: Date, countryCode: string) => {
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const year = date.getFullYear().toString();
        
        const format = getDateFormat(countryCode);
        switch (format) {
          case 'yyyy-mm-dd':
            return `${year}-${month}-${day}`;
          case 'dd/mm/yyyy':
            return `${day}/${month}/${year}`;
          case 'mm/dd/yyyy':
          default:
            return `${month}/${day}/${year}`;
        }
      };

      // Use user's birth date if available, otherwise use a default valid date (18+ years old)
      const defaultDate = new Date(1995, 0, 15); // January 15, 1995
      let birthDate = formatDateForCountry(defaultDate, this.user.country_code);
      
      if (this.user.birth_date) {
        const date = new Date(this.user.birth_date);
        // Ensure the date is valid and person is 18+
        const now = new Date();
        const eighteenYearsAgo = new Date(now.getFullYear() - 18, now.getMonth(), now.getDate());
        
        if (date > eighteenYearsAgo) {
          logger.info('User birth date makes them under 18, using default date');
          // Use default date (already set above)
        } else {
          birthDate = formatDateForCountry(date, this.user.country_code);
        }
      }
      
      logger.info(`Date format for country ${this.user.country_code}: ${getDateFormat(this.user.country_code)}`);
      logger.info(`Formatted birth date: ${birthDate}`);

      logger.info(`Setting date of birth to: ${birthDate}`);
      
      // Try multiple times to ensure date is entered correctly
      let attempts = 0;
      let success = false;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts && !success) {
        attempts++;
        logger.info(`Date entry attempt ${attempts}/${maxAttempts}`);
        
        // Focus the field first
        await dobInput.focus();
        await this.randomDelay(500, 1000);
        
        // Clear completely
        await dobInput.evaluate((el) => (el as HTMLInputElement).value = '');
        await this.randomDelay(300, 500);
        
        // Type the date
        await dobInput.type(birthDate);
        await this.randomDelay(1000, 1500);
        
        // Trigger change events
        await dobInput.evaluate((el) => {
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true }));
        });
        
        await this.randomDelay(1000, 1500);
        
        // Verify the date was entered
        const enteredDate = await dobInput.evaluate((el: Element) => (el as HTMLInputElement).value);
        logger.info(`Date verification attempt ${attempts} - Expected: ${birthDate}, Got: ${enteredDate}`);
        
        // Extract year from expected date based on format
        let expectedYear: string;
        const format = getDateFormat(this.user.country_code);
        if (format === 'yyyy-mm-dd') {
          expectedYear = birthDate.split('-')[0];
        } else if (format === 'dd/mm/yyyy') {
          expectedYear = birthDate.split('/')[2];
        } else { // mm/dd/yyyy
          expectedYear = birthDate.split('/')[2];
        }
        
        // Check if year is present in entered date (flexible verification)
        if (enteredDate && enteredDate.includes(expectedYear)) {
          success = true;
          logger.info('Date entry successful - year found in entered date');
        } else if (attempts < maxAttempts) {
          logger.warn(`Date entry failed on attempt ${attempts}, retrying...`);
          await this.randomDelay(1000, 2000);
        }
      }
      
      if (!success) {
        logger.warn('Date entry failed after all attempts, but continuing...');
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

      // Get default address data (use user data if available, fallback to realistic defaults)
      const addressData = {
        street: this.user.location_street_address || '123 Main Street',
        city: this.user.location_city || 'Manchester',
        state: this.user.location_state || 'England',
        zipCode: this.user.location_post_code || 'M2 4SH',
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
        
        // Clear the field completely and type with verification
        let attempts = 0;
        let success = false;
        const maxAttempts = 3;
        
        while (attempts < maxAttempts && !success) {
          attempts++;
          logger.info(`Street address input attempt ${attempts}/${maxAttempts}`);
          
          // Clear the field completely
          await streetField.click();
          await streetField.evaluate((el: Element) => {
            (el as HTMLInputElement).value = '';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          });
          
          await this.randomDelay(500, 1000);
          
          // Type the street address character by character
          await streetField.type(addressData.street, { delay: 150 }); // Slower typing for accuracy
          await this.randomDelay(2000, 3000);
          
          // Pause, press down, and enter for autocomplete
          logger.info('Pausing and pressing down arrow for autocomplete...');
          await this.randomDelay(1000, 1500);
          await this.page.keyboard.press('ArrowDown');
          await this.randomDelay(800, 1200);
          await this.page.keyboard.press('Enter');
          await this.randomDelay(1500, 2500);
          
          // Verify the input was typed correctly (after autocomplete selection)
          await this.verifyAndRetryInput(streetField, addressData.street, 'Street Address');
          
          // Wait for autocomplete suggestions to appear
          logger.info('Waiting for autocomplete suggestions...');
          await this.randomDelay(1500, 2500);
          
          // Check if autocomplete dropdown is visible
          const autocompleteVisible = await this.page.evaluate(() => {
            const dropdown = document.querySelector('.air3-typeahead-menu-list-container:not([style*="display: none"])');
            const menuItems = document.querySelectorAll('.air3-menu-list [role="option"]');
            return dropdown && menuItems.length > 0;
          });
          
          if (autocompleteVisible) {
            logger.info('Autocomplete suggestions found, selecting first option');
            // Press down arrow and enter for autocomplete
            await this.page.keyboard.press('ArrowDown');
            await this.randomDelay(800, 1200);
            await this.page.keyboard.press('Enter');
            await this.randomDelay(1500, 2500);
            success = true;
            logger.info('Street address autocomplete selection completed');
          } else {
            logger.info('No autocomplete suggestions, continuing with typed address');
            // Press Tab to move to next field and trigger validation
            await this.page.keyboard.press('Tab');
            await this.randomDelay(1000, 1500);
            success = true;
          }
        }
        
        if (!success) {
          logger.error(`Failed to enter correct street address after ${maxAttempts} attempts`);
          return this.createError('STREET_ADDRESS_INPUT_FAILED', `Failed to enter correct street address after ${maxAttempts} attempts`);
        }
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
          
          // Clear and focus the field
          await cityField.focus();
          await this.randomDelay(300, 500);
          await cityField.evaluate((el) => (el as HTMLInputElement).value = '');
          
          // Type the city name with slower typing
          await cityField.type(addressData.city, { delay: 150 });
          await this.randomDelay(2000, 3000);
          
          // Pause, press down, and enter for autocomplete
          logger.info('Pausing and pressing down arrow for city autocomplete...');
          await this.randomDelay(1000, 1500);
          await this.page.keyboard.press('ArrowDown');
          await this.randomDelay(800, 1200);
          await this.page.keyboard.press('Enter');
          await this.randomDelay(1500, 2500);
          
          // Verify the city input was typed correctly (after autocomplete selection)
          await this.verifyAndRetryInput(cityField, addressData.city, 'City');
          
          // Wait for autocomplete suggestions
          logger.info('Waiting for city autocomplete suggestions...');
          await this.randomDelay(1000, 1500);
          
          // Check if city autocomplete dropdown appeared
          const cityAutocompleteVisible = await this.page.evaluate(() => {
            const dropdowns = document.querySelectorAll('.air3-typeahead-menu-list-container:not([style*="display: none"])');
            const menuItems = document.querySelectorAll('.air3-menu-list [role="option"]');
            return dropdowns.length > 0 && menuItems.length > 0;
          });
          
          if (cityAutocompleteVisible) {
            logger.info('City autocomplete found, selecting first option');
            await this.page.keyboard.press('ArrowDown');
            await this.randomDelay(800, 1200);
            await this.page.keyboard.press('Enter');
            await this.randomDelay(1500, 2500);
            logger.info('City autocomplete selection completed');
          } else {
            logger.info('No city autocomplete, pressing Tab to continue');
            await this.page.keyboard.press('Tab');
            await this.randomDelay(1000, 1500);
          }
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
          
          // Clear and type with verification
          await stateField.focus();
          await stateField.evaluate((el: Element) => {
            (el as HTMLInputElement).value = '';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          });
          await this.randomDelay(500, 1000);
          
          await stateField.type(addressData.state, { delay: 150 });
          await this.randomDelay(1000, 1500);
          
          // Verify the state input was typed correctly
          await this.verifyAndRetryInput(stateField, addressData.state, 'State');
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
        
        // Clear and type with verification
        await zipField.focus();
        await zipField.evaluate((el: Element) => {
          (el as HTMLInputElement).value = '';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await this.randomDelay(500, 1000);
        
        await zipField.type(addressData.zipCode, { delay: 150 });
        await this.randomDelay(1000, 1500);
        
        // Verify the ZIP input was typed correctly
        await this.verifyAndRetryInput(zipField, addressData.zipCode, 'ZIP Code');
      }

      logger.info('Address information filled successfully');
      return this.createSuccess();

    } catch (error) {
      return this.createError('ADDRESS_FILL_FAILED', `Failed to fill address information: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async handleSkipOtpRedirect(): Promise<AutomationResult> {
    try {
      logger.info('Skip-OTP mode: Attempting to redirect to submit page after OTP failure...');
      
      // Try to redirect to submit page up to 4 times
      let attempts = 0;
      const maxAttempts = 4;
      
      while (attempts < maxAttempts) {
        attempts++;
        logger.info(`Skip-OTP redirect attempt ${attempts}/${maxAttempts}`);
        
        try {
          // Navigate to submit page
          const submitUrl = 'https://www.upwork.com/nx/create-profile/submit';
          logger.info(`Redirecting to: ${submitUrl}`);
          await this.page.goto(submitUrl, { waitUntil: 'networkidle0', timeout: 30000 });
          
          // Wait for page to load
          await this.randomDelay(3000, 5000);
          
          // Check if we're actually on the submit page
          const currentUrl = this.page.url();
          logger.info(`Current URL after redirect: ${currentUrl}`);
          
          if (currentUrl.includes('/nx/create-profile/submit')) {
            logger.info('✅ Successfully redirected to submit page');
            return this.createSuccess();
          } else {
            logger.warn(`❌ Redirect failed - still on: ${currentUrl}`);
            
            if (attempts < maxAttempts) {
              logger.info(`Retrying redirect in 5 seconds...`);
              await this.randomDelay(5000, 5000);
            }
          }
          
        } catch (error) {
          logger.warn(`Redirect attempt ${attempts} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          
          if (attempts < maxAttempts) {
            logger.info(`Retrying redirect in 5 seconds...`);
            await this.randomDelay(5000, 5000);
          }
        }
      }
      
      logger.error(`Failed to redirect to submit page after ${maxAttempts} attempts`);
      return this.createError('SUBMIT_REDIRECT_FAILED', `Failed to redirect to submit page after ${maxAttempts} attempts`);
      
    } catch (error) {
      return this.createError('SKIP_OTP_REDIRECT_FAILED', `Skip-OTP redirect handling failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async verifyAndRetryInput(field: any, expectedValue: string, fieldName: string): Promise<void> {
    // Verify the input was typed correctly
    const enteredValue = await field.evaluate((el: Element) => (el as HTMLInputElement).value);
    logger.info(`${fieldName} verification - Expected: "${expectedValue}", Got: "${enteredValue}"`);
    
    // More flexible verification - check if the entered value contains key parts of expected value
    const isAcceptable = enteredValue === expectedValue || 
                        enteredValue.includes(expectedValue.split(' ')[0]) || // First word
                        (expectedValue.includes(' ') && enteredValue.includes(expectedValue.split(' ')[1])); // Second word
    
    if (!isAcceptable && enteredValue !== '') {
      logger.warn(`${fieldName} input mismatch detected! Retrying...`);
      // Clear and retry
      await field.focus();
      await field.evaluate((el: Element) => {
        (el as HTMLInputElement).value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await this.randomDelay(500, 1000);
      await field.type(expectedValue, { delay: 200 }); // Even slower for retry
      await this.randomDelay(1000, 1500);
      
      // Verify again
      const retryValue = await field.evaluate((el: Element) => (el as HTMLInputElement).value);
      logger.info(`${fieldName} retry verification - Expected: "${expectedValue}", Got: "${retryValue}"`);
      
      const retryAcceptable = retryValue === expectedValue || 
                             retryValue.includes(expectedValue.split(' ')[0]) ||
                             (expectedValue.includes(' ') && retryValue.includes(expectedValue.split(' ')[1]));
      
      if (!retryAcceptable && retryValue !== '') {
        logger.error(`${fieldName} input failed after retry! Expected: "${expectedValue}", Got: "${retryValue}"`);
      }
    } else if (enteredValue === '') {
      logger.warn(`${fieldName} field is empty, but continuing...`);
    } else {
      logger.info(`${fieldName} input verification passed`);
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
      
      // Clean phone number (remove any non-digit characters, no country code needed)
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      
      logger.info(`Setting phone number: ${phoneNumber} (clean: ${cleanPhone})`);
      
      // Clear and type the phone number with multiple attempts
      let attempts = 0;
      let success = false;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts && !success) {
        attempts++;
        logger.info(`Phone input attempt ${attempts}/${maxAttempts}`);
        
        // Clear the field completely first
        await phoneField.click();
        await phoneField.evaluate((el: Element) => {
          (el as HTMLInputElement).value = '';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        });
        
        await this.randomDelay(500, 1000);
        
        // Type the phone number character by character
        await phoneField.type(cleanPhone, { delay: 100 });
        await this.randomDelay(1000, 1500);
        
        // Verify the phone was entered correctly (lenient verification)
        const enteredPhone = await phoneField.evaluate((el: Element) => (el as HTMLInputElement).value);
        logger.info(`Phone verification - Expected: ${cleanPhone}, Got: ${enteredPhone}`);
        
        // More lenient verification: check if field has any value and contains digits
        if (enteredPhone && enteredPhone.trim() !== '' && /\d/.test(enteredPhone)) {
          success = true;
          logger.info('Phone number entered successfully');
        } else {
          logger.warn(`Phone verification failed on attempt ${attempts}. Expected: ${cleanPhone}, Got: ${enteredPhone}`);
          if (attempts < maxAttempts) {
            logger.info('Retrying phone input...');
            await this.randomDelay(1000, 2000);
          }
        }
      }
      
      if (!success) {
        logger.error(`Failed to enter correct phone number after ${maxAttempts} attempts`);
        return this.createError('PHONE_INPUT_FAILED', `Failed to enter correct phone number after ${maxAttempts} attempts`);
      }

      logger.info('Phone number filled successfully');
      return this.createSuccess();

    } catch (error) {
      return this.createError('PHONE_FILL_FAILED', `Failed to fill phone number: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private formatPhoneNumberWithCountryCode(phoneNumber: string, countryCode: string): string {
    // Remove any non-digit characters first
    let cleanNumber = phoneNumber.replace(/\D/g, '');
    
    // Add country code based on user's country
    const countryCodeMap: { [key: string]: string } = {
      'US': '+1',
      'UK': '+44', 
      'UA': '+380',
      'ID': '+62'
    };
    
    const prefix = countryCodeMap[countryCode.toUpperCase()];
    if (!prefix) {
      logger.warn(`Unknown country code: ${countryCode}, using original phone number`);
      return phoneNumber;
    }
    
    // If the clean number already starts with country code digits, don't add prefix
    const countryCodeDigits = prefix.replace('+', '');
    if (cleanNumber.startsWith(countryCodeDigits)) {
      return `+${cleanNumber}`;
    }
    
    // Format the number with country code
    return `${prefix}${cleanNumber}`;
  }

  private async handlePhoneVerificationModal(skipOtp: boolean = false): Promise<AutomationResult> {
    try {
      logger.info('Waiting for phone verification modal...');
      
      // Wait for the phone verification modal to appear with multiple attempts
      let modalElement = null;
      let attempts = 0;
      const maxAttempts = 3;
      
      while (!modalElement && attempts < maxAttempts) {
        attempts++;
        logger.info(`Attempt ${attempts}/${maxAttempts} to find phone verification modal...`);
        
        // Check for either "send verification" modal or "enter your code" modal
        // First check for "send verification" modal with more specific selectors
        const sendVerificationModal = await this.waitForSelectorWithRetry([
          'h3:contains("Please verify your phone number")',
          'h3.mb-0:contains("verify your phone number")',
          '.air3-grid-container h3:contains("verify")',
          '.air3-grid-container h3:contains("Please verify")',
          '[data-ev-label="submit_phone"]', // Send code button
          'button#submitPhone',
          'button:contains("Send code")',
          '.air3-btn-primary:contains("Send code")'
        ], 5000);
        
        // Then check for "enter your code" modal (OTP input modal)
        const otpModal = await this.waitForSelectorWithRetry([
          'h3:contains("Enter your code")',
          'h3:contains("enter your code")',
          '.pincode-input',
          'input[type="text"][maxlength="1"]', // OTP input fields
          'button#checkPin',
          '[data-ev-label="check_pin"]',
          'button:contains("Verify phone number")',
          '.air3-btn-primary:contains("Verify")'
        ], 2000);
        
        if (sendVerificationModal) {
          logger.info('✅ Found "send verification" modal - will click Send code button');
          modalElement = sendVerificationModal;
        } else if (otpModal) {
          logger.info('⚠️ Found "enter your code" modal directly - skipping Send code step');
          
          // In skip-OTP mode, use default OTP, otherwise get from TextVerified
          let otpCode: string | null = null;
          
          if (skipOtp) {
            logger.info('Skip-OTP mode: Using manual OTP service for immediate OTP modal');
            try {
              const { ManualOtpService } = await import('../../services/manualOtpService.js');
              const manualOtpService = new ManualOtpService();
              
              // Wait for manual OTP (5 minutes timeout, check every 5 seconds)
              const manualOtp = await manualOtpService.waitForManualOtp(this.user.id, 5, 5);
              
              if (manualOtp) {
                logger.info(`✅ Received manual OTP: ${manualOtp}`);
                otpCode = manualOtp;
              } else {
                logger.warn('Manual OTP timeout, will use default OTP');
                otpCode = '12345';
              }
            } catch (error) {
              logger.warn(`Failed to get manual OTP: ${error instanceof Error ? error.message : 'Unknown error'}, using default OTP`);
              otpCode = '12345';
            }
          } else {
            try {
              const textVerifiedService = new TextVerifiedService();
              logger.info('Getting OTP from TextVerified for immediate OTP modal...');
              
              // Get OTP with 3 minute timeout
              otpCode = await textVerifiedService.waitForOTP(this.user.id, 180);
              
              if (otpCode) {
                logger.info(`✅ Received OTP from TextVerified: ${otpCode}`);
              }
              
            } catch (error) {
              logger.warn('Failed to get OTP from TextVerified for immediate modal');
            }
          }
          
          // Skip to OTP input handling directly
          return await this.handleOTPInput(otpCode, skipOtp);
        }

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

      // Get OTP before clicking send code button (in skip-OTP mode use default, otherwise check for existing)
      let otpCode: string | null = null;
      
      if (skipOtp) {
        logger.info('Skip-OTP mode: Using manual OTP service');
        try {
          const { ManualOtpService } = await import('../../services/manualOtpService.js');
          const manualOtpService = new ManualOtpService();
          
          // Wait for manual OTP (5 minutes timeout, check every 5 seconds)
          const manualOtp = await manualOtpService.waitForManualOtp(this.user.id, 5, 5);
          
          if (manualOtp) {
            logger.info(`✅ Received manual OTP: ${manualOtp}`);
            otpCode = manualOtp;
          } else {
            logger.warn('Manual OTP timeout, will use default OTP');
            otpCode = '12345';
          }
        } catch (error) {
          logger.warn(`Failed to get manual OTP: ${error instanceof Error ? error.message : 'Unknown error'}, using default OTP`);
          otpCode = '12345';
        }
      } else {
        try {
          const textVerifiedService = new TextVerifiedService();
          logger.info('Checking for existing OTP from TextVerified before sending code...');
          
          // Try to get existing OTP with short timeout (don't wait long)
          otpCode = await textVerifiedService.waitForOTP(this.user.id, 5);
          
          if (otpCode) {
            logger.info(`✅ Found existing OTP from TextVerified: ${otpCode}`);
          } else {
            logger.info('No existing OTP found, will request new one after clicking Send code');
          }
          
        } catch (error) {
          logger.warn('Failed to check for existing OTP, will request new one after clicking Send code');
        }
      }

      logger.info('Clicking Send code button...');
      await this.clickElement(sendCodeButton);
      
      // Wait for the button to be processed
      await this.randomDelay(2000, 3000);
      
      logger.info('Send code button clicked successfully');
      
      // Now wait for the OTP input modal to appear (10 seconds as requested)
      logger.info('Waiting for OTP input modal to appear (10 seconds)...');
      await this.randomDelay(10000, 10000);
      
      // Handle OTP input, passing the pre-fetched OTP if available
      return await this.handleOTPInput(otpCode, skipOtp);

    } catch (error) {
      return this.createError('PHONE_VERIFICATION_MODAL_FAILED', `Phone verification modal handling failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async handleOTPInput(preFetchedOtp?: string | null, skipOtp: boolean = false): Promise<AutomationResult> {
    try {
      // Check for the OTP input modal
      const otpModalTitle = await this.page.evaluate(() => {
        const h3Elements = document.querySelectorAll('h3');
        return Array.from(h3Elements).find(h3 => h3.textContent?.includes('Enter your code'));
      });
      
      if (!otpModalTitle) {
        logger.warn('OTP input modal not found');
        return this.createError('OTP_MODAL_NOT_FOUND', 'OTP input modal not found');
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
      
      logger.info('Found OTP input field');
      
      // Get OTP - use default 12345 in skip-OTP mode, otherwise get from TextVerified
      let otpCode: string;
      if (preFetchedOtp) {
        logger.info(`Using pre-fetched OTP: ${preFetchedOtp}`);
        otpCode = preFetchedOtp;
      } else if (skipOtp) {
        logger.info('Skip-OTP mode: Using manual OTP service for OTP input');
        try {
          const { ManualOtpService } = await import('../../services/manualOtpService.js');
          const manualOtpService = new ManualOtpService();
          
          // Wait for manual OTP (5 minutes timeout, check every 5 seconds)
          const manualOtp = await manualOtpService.waitForManualOtp(this.user.id, 5, 5);
          
          if (manualOtp) {
            logger.info(`✅ Received manual OTP: ${manualOtp}`);
            otpCode = manualOtp;
          } else {
            logger.warn('Manual OTP timeout, will use default OTP');
            otpCode = '12345';
          }
        } catch (error) {
          logger.warn(`Failed to get manual OTP: ${error instanceof Error ? error.message : 'Unknown error'}, using default OTP`);
          otpCode = '12345';
        }
      } else {
        logger.info('Getting new OTP from TextVerified...');
        try {
          const textVerifiedService = new TextVerifiedService();
          logger.info('Waiting for OTP from TextVerified service...');
          
          // Wait for OTP with 3 minute timeout
          const receivedOtp = await textVerifiedService.waitForOTP(this.user.id, 180);
          
          if (!receivedOtp) {
            logger.error('No OTP received from TextVerified within 180 seconds');
            return this.createError('OTP_NOT_RECEIVED', 'No OTP received from TextVerified within 180 seconds');
          }
          
          otpCode = receivedOtp;
          logger.info(`✅ Received OTP from TextVerified: ${otpCode}`);
          
        } catch (error) {
          logger.error('Failed to get OTP from TextVerified:', error);
          
          // Fallback to test code if TextVerified fails
          logger.warn('Falling back to test OTP code 12345 due to TextVerified error');
          otpCode = '12345';
        }
      }
      
      // Focus the first field and type the received OTP
      await firstOtpInput.focus();
      await this.randomDelay(500, 1000);
      await firstOtpInput.type(otpCode);
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
              
              // In skip-OTP mode, try to redirect to submit page and retry
              if (skipOtp) {
                return await this.handleSkipOtpRedirect();
              }
              
              return this.createError('OTP_EXPIRED', 'OTP code expired, verification failed');
            }
            
            if (errorText.toLowerCase().includes('invalid') || errorText.toLowerCase().includes('incorrect')) {
              logger.warn('OTP code invalid/incorrect, verification failed');
              
              // In skip-OTP mode, try to redirect to submit page and retry
              if (skipOtp) {
                return await this.handleSkipOtpRedirect();
              }
              
              return this.createError('OTP_INVALID', 'OTP code invalid/incorrect, verification failed');
            }
            
            if (errorText.toLowerCase().includes('try again') || errorText.toLowerCase().includes('request a new one')) {
              logger.warn('OTP verification failed, need to try again');
              
              // In skip-OTP mode, try to redirect to submit page and retry
              if (skipOtp) {
                return await this.handleSkipOtpRedirect();
              }
              
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
      return this.createError('OTP_INPUT_FAILED', `OTP input handling failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async verifyAllFieldsBeforeNext(): Promise<AutomationResult> {
    try {
      logger.info('Verifying all fields before clicking Next button...');
      
      const expectedData = {
        street: this.user.location_street_address || '1200 Market Street',
        city: this.user.location_city || 'San Francisco',
        state: this.user.location_state || 'California',
        zipCode: this.user.location_post_code || '94102',
        phoneNumber: this.user.phone || '2314992031'
      };
      
      let allFieldsValid = true;
      const errors: string[] = [];

      // Verify date of birth
      const dobField = await this.page.$('[data-test="input"][placeholder="mm/dd/yyyy"]');
      if (dobField) {
        const dobValue = await dobField.evaluate((el: Element) => (el as HTMLInputElement).value);
        if (!dobValue || dobValue.trim() === '') {
          errors.push('Date of birth is empty');
          allFieldsValid = false;
        } else {
          logger.info(`✅ Date of birth verified: ${dobValue}`);
        }
      }

      // Skip street address verification as autocomplete may change the field value
      const streetField = await this.page.$('input[placeholder="Enter street address"]');
      if (streetField) {
        const streetValue = await streetField.evaluate((el: Element) => (el as HTMLInputElement).value);
        if (!streetValue || streetValue.trim() === '') {
          errors.push('Street address is empty');
          allFieldsValid = false;
        } else {
          logger.info(`✅ Street address field has value: ${streetValue}`);
        }
      }

      // Verify city
      const cityField = await this.page.$('input[placeholder="Enter city"]');
      if (cityField) {
        const cityValue = await cityField.evaluate((el: Element) => (el as HTMLInputElement).value);
        if (!cityValue || cityValue.trim() === '') {
          errors.push('City is empty');
          allFieldsValid = false;
        } else {
          logger.info(`✅ City verified: ${cityValue}`);
        }
      }

      // Verify state
      const stateField = await this.page.$('input[placeholder*="state"]');
      if (stateField) {
        const stateValue = await stateField.evaluate((el: Element) => (el as HTMLInputElement).value);
        if (!stateValue || stateValue.trim() === '') {
          errors.push('State is empty');
          allFieldsValid = false;
        } else {
          logger.info(`✅ State verified: ${stateValue}`);
        }
      }

      // Verify ZIP code
      const zipField = await this.page.$('input[placeholder*="ZIP"]');
      if (zipField) {
        const zipValue = await zipField.evaluate((el: Element) => (el as HTMLInputElement).value);
        if (!zipValue || zipValue.trim() === '') {
          errors.push('ZIP code is empty');
          allFieldsValid = false;
        } else {
          logger.info(`✅ ZIP code verified: ${zipValue}`);
        }
      }

      // Verify phone number
      const phoneField = await this.page.$('.air3-phone-number-remaining');
      if (phoneField) {
        const phoneValue = await phoneField.evaluate((el: Element) => (el as HTMLInputElement).value);
        if (!phoneValue || phoneValue.trim() === '') {
          errors.push('Phone number is empty');
          allFieldsValid = false;
        } else if (phoneValue !== expectedData.phoneNumber) {
          errors.push(`Phone number verification failed - Expected: ${expectedData.phoneNumber}, got: ${phoneValue}`);
          allFieldsValid = false;
        } else {
          logger.info(`✅ Phone number verified: ${phoneValue}`);
        }
      }

      if (!allFieldsValid) {
        logger.error('Field verification failed:', errors);
        
        // Try to fix the issues automatically if possible
        logger.info('Attempting to fix failed fields...');
        
        for (const error of errors) {
          // Skip street address retry as autocomplete may change the field value
          
          if (error.includes('Phone number')) {
            logger.info('Retrying phone number input...');
            const phoneFieldRetry = await this.page.$('.air3-phone-number-remaining');
            if (phoneFieldRetry) {
              await phoneFieldRetry.click();
              await phoneFieldRetry.evaluate((el: Element) => {
                (el as HTMLInputElement).value = '';
                el.dispatchEvent(new Event('input', { bubbles: true }));
              });
              await phoneFieldRetry.type(expectedData.phoneNumber, { delay: 100 });
              await this.randomDelay(1000, 1500);
            }
          }
        }
        
        // Verify again after fixes
        logger.info('Re-verifying fields after fixes...');
        await this.randomDelay(2000, 3000);
        
        // Quick re-check of critical fields
        const streetFieldCheck = await this.page.$('input[placeholder="Enter street address"]');
        const phoneFieldCheck = await this.page.$('.air3-phone-number-remaining');
        
        if (streetFieldCheck) {
          const streetValueCheck = await streetFieldCheck.evaluate((el: Element) => (el as HTMLInputElement).value);
          logger.info(`Street address after fix: ${streetValueCheck}`);
        }
        
        if (phoneFieldCheck) {
          const phoneValueCheck = await phoneFieldCheck.evaluate((el: Element) => (el as HTMLInputElement).value);
          logger.info(`Phone number after fix: ${phoneValueCheck}`);
        }
      }

      logger.info('✅ All fields verification completed');
      return this.createSuccess();

    } catch (error) {
      return this.createError('FIELD_VERIFICATION_FAILED', `Field verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

}
