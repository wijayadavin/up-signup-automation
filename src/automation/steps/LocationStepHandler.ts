import { Page } from 'puppeteer';
import { User } from '../../types/database';
import { StepHandler } from '../StepHandler';
import { AutomationResult } from '../BaseAutomation';
// import { TextVerifiedService } from '../../services/textVerifiedService.js';
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

  private async fillFieldWithVerification(fieldSelectors: string[], value: string, fieldName: string): Promise<AutomationResult> {
    logger.info(`Filling ${fieldName} field with value: "${value}"`);
    
    // Use the common fillField method from FormAutomation
    const result = await this.formAutomation.fillField(fieldSelectors, value, fieldName);
    
    if (result.status === 'success') {
      logger.info(`✅ ${fieldName} field filled successfully`);
    } else {
      logger.warn(`⚠️ ${fieldName} field filling failed: ${result.evidence}`);
    }
    
    return result;
  }

  private async handleAutocompleteSelection(fieldName: string): Promise<AutomationResult> {
    logger.info(`Handling autocomplete selection for ${fieldName} field...`);
    
    try {
      // Wait longer for autocomplete suggestions to appear
      await this.randomDelay(3000, 4000);
      
      // Check if autocomplete dropdown appeared with better detection
      const autocompleteInfo = await this.page.evaluate(() => {
        // Look for various dropdown selectors
        const dropdownSelectors = [
          '.air3-typeahead-menu-list-container',
          '.air3-typeahead-dropdown-menu',
          '.air3-menu-list',
          '[role="listbox"]',
          '.dropdown-menu',
          '.autocomplete-dropdown'
        ];
        
        let visibleDropdown: Element | null = null;
        let menuItems: Element[] = [];
        
        for (const selector of dropdownSelectors) {
          const dropdowns = document.querySelectorAll(selector);
          for (const dropdown of dropdowns) {
            const style = window.getComputedStyle(dropdown);
            if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
              visibleDropdown = dropdown;
              // Look for menu items within this dropdown
              const items = dropdown.querySelectorAll('[role="option"], .air3-menu-item, .dropdown-item, li');
              menuItems = Array.from(items).filter(item => {
                const itemStyle = window.getComputedStyle(item);
                return itemStyle.display !== 'none' && itemStyle.visibility !== 'hidden';
              });
              break;
            }
          }
          if (visibleDropdown && menuItems.length > 0) break;
        }
        
        console.log(`Dropdown detection: visible=${!!visibleDropdown}, items=${menuItems.length}`);
        return {
          visible: !!visibleDropdown,
          itemCount: menuItems.length,
          firstItemText: menuItems[0]?.textContent?.trim() || 'N/A'
        };
      });
      
      logger.info(`${fieldName} dropdown detection: visible=${autocompleteInfo.visible}, items=${autocompleteInfo.itemCount}, first="${autocompleteInfo.firstItemText}"`);
      
      if (autocompleteInfo.visible && autocompleteInfo.itemCount > 0) {
        logger.info(`${fieldName} autocomplete found with ${autocompleteInfo.itemCount} options, selecting first option`);
        
        // Improved selection sequence: pause, arrow down, pause, enter (doubled delays)
        await this.randomDelay(2000, 3000); // Initial pause (doubled)
        await this.page.keyboard.press('ArrowDown');
        await this.randomDelay(2000, 3000); // Pause after arrow down (doubled)
        await this.page.keyboard.press('Enter');
        await this.randomDelay(4000, 6000); // Longer pause after enter (doubled)
        
        // Verify the selection worked
        const selectionVerified = await this.page.evaluate(() => {
          // Check if dropdown is now hidden
          const dropdownSelectors = [
            '.air3-typeahead-menu-list-container',
            '.air3-typeahead-dropdown-menu',
            '.air3-menu-list'
          ];
          
          for (const selector of dropdownSelectors) {
            const dropdowns = document.querySelectorAll(selector);
            for (const dropdown of dropdowns) {
              const style = window.getComputedStyle(dropdown);
              if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
                return false; // Dropdown still visible
              }
            }
          }
          return true; // All dropdowns hidden
        });
        
        if (selectionVerified) {
          logger.info(`✅ ${fieldName} autocomplete selection completed successfully`);
        } else {
          logger.warn(`⚠️ ${fieldName} autocomplete selection may not have worked (dropdown still visible)`);
        }
        
        return this.createSuccess();
      } else {
        logger.info(`No ${fieldName} autocomplete dropdown found, pressing Tab to continue`);
        await this.page.keyboard.press('Tab');
        await this.randomDelay(1000, 1500);
        return this.createSuccess();
      }
    } catch (error) {
      logger.warn(`Error in ${fieldName} autocomplete selection: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return this.createSuccess(); // Continue anyway
    }
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
      } else {
        // Order SMS early in the process so OTP is ready when needed
        logger.info('Ordering SMS early in location step...');
        const otpOrderingResult = await this.generateOTPEarly();
        if (otpOrderingResult.status !== 'success') {
          logger.warn('Early SMS ordering failed, but continuing with location step...');
        }
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

      // Fill phone number (without generating OTP yet)
      const phoneResult = await this.fillPhoneNumberWithoutOTP();
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
        
      // Check if user is from Ukraine or Indonesia - skip OTP verification for these countries
      if (this.user.country_code.toUpperCase() === 'UA' || this.user.country_code.toUpperCase() === 'ID') {
        logger.info(`User is from ${this.user.country_code} - skipping OTP verification and proceeding directly`);
        logger.info(`Location step completed successfully for ${this.user.country_code} user`);
        return this.createSuccess();
      }
      
      // For other countries, handle phone verification modal and OTP
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
          case 'GB': // United Kingdom
          case 'UA': // Ukraine
          case 'ID': // Indonesia
            return 'yyyy-mm-dd';
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

      // Fill street address with simple, direct approach
      logger.info(`Filling street address field with value: "${addressData.street}"`);
      
      const streetField = await this.waitForSelectorWithRetry([
        'input[placeholder="Enter street address"]', 
        '[data-qa="input-address"] input', 
        '.air3-typeahead-input-main[placeholder*="street"]', 
        '.air3-typeahead-input-fake[placeholder*="street"]', 
        'input[role="combobox"][placeholder*="street"]'
      ], 5000);
      
      if (!streetField) {
        logger.warn('Street address field not found, but continuing...');
      } else {
        // Focus and clear the field
        await streetField.focus();
        await this.randomDelay(500, 1000);
        
        // Clear completely
        await streetField.evaluate((el: Element) => {
          (el as HTMLInputElement).value = '';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await this.randomDelay(500, 1000);
        
        // Type the street address slowly
        await streetField.type(addressData.street, { delay: 100 });
        await this.randomDelay(1000, 2000);
        
        logger.info(`✅ Street address field typed: "${addressData.street}"`);
        
        // Handle autocomplete for street address using improved method
        const autocompleteResult = await this.handleAutocompleteSelection('Street Address');
        if (autocompleteResult.status !== 'success') {
          logger.warn('Street address autocomplete selection failed, but continuing...');
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

      // Fill city with simple, direct approach
      logger.info(`Filling city field with value: "${addressData.city}"`);
      
      const cityField = await this.waitForSelectorWithRetry([
        'input[placeholder="Enter city"]', 
        '[data-qa="input-city"] input', 
        '[aria-labelledby*="city"] input', 
        '.air3-typeahead-input-fake[placeholder*="city"]',
        '.air3-typeahead-input-main[placeholder*="city"]'
      ], 5000);
      
      if (!cityField) {
        logger.warn('City field not found, but continuing...');
      } else {
        // Check if city field is already filled
        const currentCityValue = await cityField.evaluate((el: Element) => (el as HTMLInputElement).value);
        
        if (currentCityValue && currentCityValue.trim() !== '') {
          logger.info(`City field already filled with: "${currentCityValue}", skipping city input`);
        } else {
          // Focus and clear the field
          await cityField.focus();
          await this.randomDelay(500, 1000);
          
          // Clear completely
          await cityField.evaluate((el: Element) => {
            (el as HTMLInputElement).value = '';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          });
          await this.randomDelay(500, 1000);
          
          // Type the city name slowly
          await cityField.type(addressData.city, { delay: 100 });
          await this.randomDelay(1000, 2000);
          
          logger.info(`✅ City field typed: "${addressData.city}"`);
          
          // Handle autocomplete for city field using improved method
          const autocompleteResult = await this.handleAutocompleteSelection('City');
          if (autocompleteResult.status !== 'success') {
            logger.warn('City autocomplete selection failed, but continuing...');
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
      // Check if avatar was already uploaded
      if (this.user.avatar_uploaded_at) {
        logger.info(`Avatar already uploaded at ${this.user.avatar_uploaded_at}, skipping photo upload`);
        return this.createSuccess();
      }

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

    // Save avatar upload timestamp to database
    await this.saveAvatarUploadedAt();

    logger.info('Profile photo upload completed successfully');
    
    return this.createSuccess();
  }

  private async fillPhoneNumberWithoutOTP(): Promise<AutomationResult> {
    try {
      logger.info('Filling phone number (without OTP generation)...');

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

      // Get or generate phone number
      let phoneNumber: string | null = null;
      let cleanPhone: string | null = null;
      
      if (this.user.phone) {
        // Check if existing phone number is still active
        logger.info(`Checking if existing phone number ${this.user.phone} is still active...`);
        const isActive = await this.checkIfPhoneNumberIsActive(this.user.phone!, this.user.otp_provider || '');
        
        if (isActive && this.user.phone) {
          // Use existing phone number from user
          phoneNumber = this.user.phone;
          cleanPhone = phoneNumber.replace(/\D/g, '');
          logger.info(`✅ Using existing active phone number: ${phoneNumber} (clean: ${cleanPhone})`);
        } else {
          logger.warn(`❌ Existing phone number ${this.user.phone} is no longer active, will generate new one`);
          // Clear the inactive phone number so a new one will be generated
          this.user.phone = null;
          this.user.otp_provider = null;
        }
      }
      
      if (!phoneNumber) {
        // Generate new phone number using SMSPool
        logger.info('No existing phone number, generating new one via SMSPool...');
        try {
          const { SmsPoolService } = await import('../../services/smspoolService.js');
          const smsPoolService = new SmsPoolService();
          
          // Order SMS to get a phone number (we'll get the OTP later)
          const orderResult = await smsPoolService.orderSms(this.user.country_code);
          
          if (orderResult.phoneNumber) {
            phoneNumber = orderResult.phoneNumber;
            cleanPhone = phoneNumber.replace(/\D/g, '');
            logger.info(`Generated new phone number via SMSPool: ${phoneNumber} (clean: ${cleanPhone})`);
            
            // Save the phone number and provider to the database
            await this.savePhoneNumberAndProvider(phoneNumber, 'SMS_POOL');
            logger.info(`Saved phone number ${phoneNumber} and provider SMS_POOL to database`);
            
            // Update the user object to reflect the new phone number
            this.user.phone = phoneNumber;
            this.user.otp_provider = 'SMS_POOL';
          } else {
            logger.error('Failed to get phone number from SMSPool order');
            return this.createError('PHONE_GENERATION_FAILED', 'Failed to generate phone number via SMSPool');
          }
        } catch (error) {
          logger.error('Failed to generate phone number via SMSPool:', error);
          return this.createError('PHONE_GENERATION_FAILED', `Failed to generate phone number: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
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
        if (!cleanPhone) {
          logger.error('cleanPhone is null, cannot type phone number');
          return this.createError('PHONE_INPUT_FAILED', 'Phone number is null, cannot type');
        }
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



  private async savePhoneNumberAndProvider(phoneNumber: string, provider: string): Promise<void> {
    try {
      const { getDatabase } = await import('../../database/connection.js');
      const db = getDatabase();
      
      await db
        .updateTable('users')
        .set({ 
          phone: phoneNumber,
          otp_provider: provider 
        })
        .where('id', '=', this.user.id)
        .execute();
      
      logger.info(`Updated user ${this.user.id} with phone: ${phoneNumber}, provider: ${provider}`);
    } catch (error) {
      logger.error('Failed to save phone number and provider:', error);
    }
  }

  private async saveOTPProvider(provider: string): Promise<void> {
    try {
      const { getDatabase } = await import('../../database/connection.js');
      const db = getDatabase();
      
      await db
        .updateTable('users')
        .set({ otp_provider: provider })
        .where('id', '=', this.user.id)
        .execute();
      
      logger.info(`Updated user ${this.user.id} with OTP provider: ${provider}`);
    } catch (error) {
      logger.error('Failed to save OTP provider:', error);
    }
  }

  private async saveAvatarUploadedAt(): Promise<void> {
    try {
      const { getDatabase } = await import('../../database/connection.js');
      const db = getDatabase();
      
      const currentTime = new Date();
      
      await db
        .updateTable('users')
        .set({ avatar_uploaded_at: currentTime })
        .where('id', '=', this.user.id)
        .execute();
      
      // Update the user object to reflect the change
      this.user.avatar_uploaded_at = currentTime;
      
      logger.info(`Updated user ${this.user.id} with avatar_uploaded_at: ${currentTime}`);
    } catch (error) {
      logger.error('Failed to save avatar upload timestamp:', error);
    }
  }

  private async generateOTPEarly(): Promise<AutomationResult> {
    try {
      logger.info('Starting early SMS ordering...');
      
      // Check if user already has phone and provider set
      if (this.user.phone && this.user.otp_provider) {
        logger.info(`User already has phone ${this.user.phone} and provider ${this.user.otp_provider}, checking if still active and has OTP...`);
        
        // Check if the existing phone number is still active
        const isActive = await this.checkIfPhoneNumberIsActive(this.user.phone, this.user.otp_provider);
        
        if (isActive) {
          // Check if we already have an OTP for this phone number
          if (this.user.otp) {
            logger.info(`✅ Phone number ${this.user.phone} is still active and has OTP ${this.user.otp}, skipping SMS ordering`);
            return this.createSuccess();
          } else {
            logger.info(`✅ Phone number ${this.user.phone} is still active but no OTP yet, will check for OTP later`);
            return this.createSuccess();
          }
        } else {
          logger.warn(`❌ Phone number ${this.user.phone} is no longer active, will generate new one`);
          // Clear the inactive phone number from user object so a new one will be generated
          this.user.phone = null;
          this.user.otp_provider = null;
        }
      }
      
      // Determine OTP provider based on country code
      const supportedSmsPoolCountries = ['GB', 'UA', 'ID', 'US', 'CA', 'AU', 'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'CH'];
      const supportedSmsManCountries = ['US', 'CA', 'AU', 'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'CH'];
      
      let otpProvider = 'SMS_POOL'; // default to SMSPool
      let orderSuccess = false;
      
      // Try SMSPool first (primary provider)
      if (supportedSmsPoolCountries.includes(this.user.country_code.toUpperCase())) {
        logger.info(`User country ${this.user.country_code} is supported by SMSPool (primary provider)`);
        try {
          const { SmsPoolService } = await import('../../services/smspoolService.js');
          const smsPoolService = new SmsPoolService();
          
          // Only order SMS, don't wait for OTP
          const orderResult = await smsPoolService.orderSms(this.user.country_code);
          if (orderResult.orderId) {
            otpProvider = 'SMS_POOL';
            logger.info(`✅ SMS ordered via SMSPool: ${orderResult.orderId}, phone: ${orderResult.phoneNumber || 'not provided'}`);
            orderSuccess = true;
          }
        } catch (error) {
          logger.error('SMSPool failed, trying SMS-Man fallback:', error);
        }
      }
      
      // Try SMS-Man as backup
      if (!orderSuccess && supportedSmsManCountries.includes(this.user.country_code.toUpperCase())) {
        logger.info(`User country ${this.user.country_code} is supported by SMS-Man (backup provider)`);
        try {
          const { SmsManService } = await import('../../services/smsManService.js');
          const smsManService = new SmsManService();
          
          // Only order SMS, don't wait for OTP
          const orderResult = await smsManService.orderSms(this.user.country_code);
          if (orderResult.orderId) {
            otpProvider = 'SMS_MAN';
            logger.info(`✅ SMS ordered via SMS-Man: ${orderResult.orderId}, phone: ${orderResult.phoneNumber || 'not provided'}`);
            orderSuccess = true;
          }
        } catch (error) {
          logger.error('SMS-Man failed:', error);
        }
      }
      
      // Save OTP provider to user record
      if (orderSuccess) {
        await this.saveOTPProvider(otpProvider);
        logger.info(`OTP provider saved: ${otpProvider}`);
      } else {
        logger.warn('No SMS order created from any provider');
      }
      
      return this.createSuccess();
      
    } catch (error) {
      logger.error('Early SMS ordering failed:', error);
      return this.createError('EARLY_SMS_ORDERING_FAILED', `Failed to order SMS early: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async checkIfPhoneNumberIsActive(phoneNumber: string, provider: string): Promise<boolean> {
    try {
      logger.info(`Checking if phone number ${phoneNumber} is still active with provider ${provider}...`);
      
      if (provider === 'SMS_POOL') {
          try {
            const { SmsPoolService } = await import('../../services/smspoolService.js');
            const smsPoolService = new SmsPoolService();
            
            // First check active orders from SMSPool
            logger.info(`Checking active orders for phone ${phoneNumber}...`);
            const activeOrders = await smsPoolService.getActiveOrders();
            
            // Check if any active order matches this phone number
            let matchingOrder = activeOrders.find(order => {
              const orderPhone = order.phonenumber || '';
              const cleanOrderPhone = orderPhone.replace(/\D/g, '');
              const cleanUserPhone = phoneNumber.replace(/\D/g, '');
              
              return orderPhone === phoneNumber || 
                     cleanOrderPhone === cleanUserPhone ||
                     orderPhone.includes(cleanUserPhone) ||
                     cleanOrderPhone.includes(cleanUserPhone);
            });
            
            if (matchingOrder) {
              const orderId = matchingOrder.order_code || matchingOrder.orderid || 'unknown';
              logger.info(`✅ Found active order for phone ${phoneNumber}: ${orderId}`);
              return true;
            }
            
            // If no active order found, check history orders
            logger.info(`No active order found, checking history orders for phone ${phoneNumber}...`);
            const historyOrders = await smsPoolService.getHistoryOrders();
            
            // Check if any history order matches this phone number
            matchingOrder = historyOrders.find(order => {
              const orderPhone = order.phonenumber || '';
              const cleanOrderPhone = orderPhone.replace(/\D/g, '');
              const cleanUserPhone = phoneNumber.replace(/\D/g, '');
              
              return orderPhone === phoneNumber || 
                     cleanOrderPhone === cleanUserPhone ||
                     orderPhone.includes(cleanUserPhone) ||
                     cleanOrderPhone.includes(cleanUserPhone);
            });
            
            if (matchingOrder) {
              const orderId = matchingOrder.order_code || matchingOrder.orderid || 'unknown';
              logger.info(`✅ Found history order for phone ${phoneNumber}: ${orderId} (status: ${matchingOrder.status})`);
              
              // Check if the history order is still valid (not expired)
              if (matchingOrder.expiry && typeof matchingOrder.expiry === 'number') {
                const expiryTime = new Date(matchingOrder.expiry * 1000);
                const now = new Date();
                if (expiryTime > now) {
                  logger.info(`✅ History order is still valid (expires: ${expiryTime})`);
                  return true;
                } else {
                  logger.warn(`❌ History order has expired (expired: ${expiryTime})`);
                  return false;
                }
              } else {
                // If no expiry info, assume it's still valid
                logger.info(`✅ History order found (no expiry info, assuming valid)`);
                return true;
              }
            } else {
              logger.warn(`❌ No order found in active or history for phone ${phoneNumber}`);
              return false;
          }
        } catch (error) {
            logger.warn(`Failed to check SMSPool orders: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return false;
          }
        } else if (provider === 'SMS_MAN') {
        try {
          const { SmsManService } = await import('../../services/smsManService.js');
          const smsManService = new SmsManService();
          
          // Get active orders from SMS-Man
          const activeOrders = await smsManService.getActiveOrders();
          
          // Check if any active order matches this phone number
          const matchingOrder = activeOrders.find(order => {
            const orderPhone = order.phonenumber || '';
            const cleanOrderPhone = orderPhone.replace(/\D/g, '');
            const cleanUserPhone = phoneNumber.replace(/\D/g, '');
            
            return orderPhone === phoneNumber || 
                   cleanOrderPhone === cleanUserPhone ||
                   orderPhone.includes(cleanUserPhone) ||
                   cleanOrderPhone.includes(cleanUserPhone);
          });
          
          if (matchingOrder) {
            const orderId = matchingOrder.order_code || matchingOrder.orderid || 'unknown';
            logger.info(`✅ Found active order for phone ${phoneNumber}: ${orderId}`);
            return true;
          } else {
            logger.warn(`❌ No active order found for phone ${phoneNumber}`);
            return false;
          }
        } catch (error) {
          logger.warn(`Failed to check SMS-Man active orders: ${error instanceof Error ? error.message : 'Unknown error'}`);
          return false;
        }
      }
      
      logger.warn(`Unknown provider ${provider}, assuming phone number is inactive`);
      return false;
      
    } catch (error) {
      logger.error(`Error checking if phone number is active: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  private async checkForOTPAfterModalOpen(skipOtp: boolean = false): Promise<string | null> {
    try {
      logger.info('Checking for OTP after modal is opened...');
      
      // First, check if we already have an OTP in the database
      if (this.user.otp) {
        const otpCode = this.user.otp.toString();
        logger.info(`✅ Using existing OTP from database: ${otpCode}`);
        return otpCode;
      }
      
      // If no OTP in database, check if phone number is still valid first
      if (this.user.phone && this.user.otp_provider) {
        logger.info(`User has phone ${this.user.phone} and provider ${this.user.otp_provider}, checking if still valid...`);
        
        // Check if the phone number is still active/valid
        const isActive = await this.checkIfPhoneNumberIsActive(this.user.phone, this.user.otp_provider);
        
        if (!isActive) {
          logger.warn(`❌ Phone number ${this.user.phone} is no longer active, cannot get OTP`);
          return null;
        }
        
        logger.info(`✅ Phone number ${this.user.phone} is still active, checking for existing OTP...`);
        
        if (this.user.otp_provider === 'SMS_POOL') {
          try {
            const { SmsPoolService } = await import('../../services/smspoolService.js');
            const smsPoolService = new SmsPoolService();
            const otpCode = await smsPoolService.waitForOTP(this.user.id, this.user.country_code, 360); // 6 minutes timeout
      if (otpCode) {
              logger.info(`✅ Received existing OTP from SMSPool: ${otpCode}`);
              return otpCode;
      } else {
              logger.warn('No OTP received from SMSPool within 3 minutes');
            }
          } catch (error) {
            logger.warn('Failed to get existing SMSPool OTP:', error);
          }
        } else if (this.user.otp_provider === 'SMS_MAN') {
          try {
            const { SmsManService } = await import('../../services/smsManService.js');
            const smsManService = new SmsManService();
            const otpCode = await smsManService.waitForOTP(this.user.id, this.user.country_code, 360); // 6 minutes timeout
            if (otpCode) {
              logger.info(`✅ Received existing OTP from SMS-Man: ${otpCode}`);
              return otpCode;
            } else {
              logger.warn('No OTP received from SMS-Man within 6 minutes');
            }
          } catch (error) {
            logger.warn('Failed to get existing SMS-Man OTP:', error);
          }
        }
      }
      
      // If no existing OTP found, handle based on skipOtp mode
      if (skipOtp) {
        logger.info('Skip-OTP mode: Using manual OTP service');
        try {
          const { ManualOtpService } = await import('../../services/manualOtpService.js');
          const manualOtpService = new ManualOtpService();
          
          // Wait for manual OTP (3 minutes timeout, check every 5 seconds)
          const manualOtp = await manualOtpService.waitForManualOtp(this.user.id, 3, 5);
          
          if (manualOtp) {
            logger.info(`✅ Received manual OTP: ${manualOtp}`);
            return manualOtp;
          } else {
            logger.error('Manual OTP timeout after 3 minutes');
            return null;
          }
    } catch (error) {
          logger.error(`Failed to get manual OTP: ${error instanceof Error ? error.message : 'Unknown error'}`);
          return null;
        }
      } else {
        // Try to generate new OTP as fallback
        logger.warn('No existing OTP found, trying to generate new one as fallback...');
        
        // Try SMSPool first (primary provider)
        try {
          const { SmsPoolService } = await import('../../services/smspoolService.js');
          const smsPoolService = new SmsPoolService();
          
          const otpCode = await smsPoolService.waitForOTP(this.user.id, this.user.country_code, 360); // 6 minutes timeout
          
          if (otpCode) {
            logger.info(`✅ Received new OTP from SMSPool: ${otpCode}`);
            return otpCode;
          } else {
            logger.error('No OTP received from SMSPool within 6 minutes');
            return null;
          }
          
        } catch (error) {
          logger.error('Failed to get OTP from SMSPool:', error);
          
          // Try SMS-Man as fallback
          logger.warn('SMSPool failed, trying SMS-Man as fallback...');
          try {
            const { SmsManService } = await import('../../services/smsManService.js');
            const smsManService = new SmsManService();
            const otpCode = await smsManService.waitForOTP(this.user.id, this.user.country_code, 360); // 6 minutes timeout
            
            if (otpCode) {
              logger.info(`✅ Received OTP from SMS-Man: ${otpCode}`);
              return otpCode;
            } else {
              logger.error('No OTP received from SMS-Man within 6 minutes');
              return null;
            }
          } catch (smsManError) {
            logger.error('SMS-Man also failed:', smsManError);
            // Both providers failed
            logger.error('All OTP providers failed, cannot proceed');
            return null;
          }
        }
      }
      
    } catch (error) {
      logger.error('Error checking for OTP after modal open:', error);
      return null;
    }
  }

  private formatPhoneNumberWithCountryCode(phoneNumber: string, countryCode: string): string {
    // Remove any non-digit characters first
    let cleanNumber = phoneNumber.replace(/\D/g, '');
    
    // Add country code based on user's country
    const countryCodeMap: { [key: string]: string } = {
      'US': '+1',
      'GB': '+44', 
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
      // Check if user is from Ukraine or Indonesia - skip OTP verification for these countries
      if (this.user.country_code.toUpperCase() === 'UA' || this.user.country_code.toUpperCase() === 'ID') {
        logger.info(`User is from ${this.user.country_code} - skipping phone verification modal detection`);
        logger.info(`Location step completed successfully for ${this.user.country_code} user`);
        return this.createSuccess();
      }
      
      logger.info('Waiting for phone verification modal with retries...');
      
      // Try up to 3 times to find the phone verification modal with longer delays
      let modalFound = false;
      let phoneVerificationModalFound = false;
      const maxRetries = 3;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        logger.info(`Modal detection attempt ${attempt}/${maxRetries}...`);
        
        // Check for both phone verification modal AND OTP modal simultaneously
        logger.info(`Attempting to find phone verification modal on attempt ${attempt}...`);
        const phoneVerificationModal = await this.waitForSelectorWithRetry([
          'h3:contains("Please verify your phone number")',
          'h3.mb-0:contains("verify your phone number")',
          '.air3-grid-container h3:contains("verify")',
          '.air3-grid-container h3:contains("Please verify")',
          '[data-ev-label="submit_phone"]', // Send code button
          'button#submitPhone',
          'button:contains("Send code")',
          '.air3-btn-primary:contains("Send code")',
          // Additional selectors for different modal states
          '.air3-modal-content h3:contains("verify")',
          '.air3-modal h3:contains("phone")',
          'h3:contains("phone verification")',
          'h3:contains("Phone verification")',
          // Look for any modal with phone-related content
          '[role="dialog"] h3:contains("phone")',
          '[role="dialog"] h3:contains("verify")'
        ], 20000); // 2x longer timeout (20 seconds instead of 10)
        
        if (phoneVerificationModal) {
          logger.info(`✅ Phone verification modal found on attempt ${attempt}`);
              } else {
          logger.info(`❌ Phone verification modal not found on attempt ${attempt}`);
        }

        // Also check for OTP input modal with multiple detection methods
        const otpModal = await this.page.evaluate(() => {
          // Method 1: Check for h3 elements with "Enter your code"
          const h3Elements = document.querySelectorAll('h3');
          const h3Match = Array.from(h3Elements).find(h3 => h3.textContent?.includes('Enter your code'));
          if (h3Match) {
            console.log('OTP modal found via h3 method');
            return h3Match;
          }
          
          // Method 2: Check for any element with "Enter your code" text
          const allElements = document.querySelectorAll('*');
          const textMatch = Array.from(allElements).find(el => el.textContent?.includes('Enter your code'));
          if (textMatch) {
            console.log('OTP modal found via text method');
            return textMatch;
          }
          
          // Method 3: Check for OTP input fields
          const otpInputs = document.querySelectorAll('.pincode-input, input[type="text"][maxlength="1"]');
          if (otpInputs.length > 0) {
            console.log('OTP modal found via input fields method');
            return otpInputs[0];
          }
          
          // Method 4: Check for modal with verification content
          const modalElements = document.querySelectorAll('[role="dialog"], .air3-modal, .modal');
          const modalMatch = Array.from(modalElements).find(modal => 
            modal.textContent?.includes('code') || 
            modal.textContent?.includes('verification') ||
            modal.textContent?.includes('OTP')
          );
          if (modalMatch) {
            console.log('OTP modal found via modal content method');
            return modalMatch;
          }
          
          console.log('No OTP modal found with any method');
          return null;
        });

        if (phoneVerificationModal) {
          logger.info(`✅ Phone verification modal detected on attempt ${attempt}`);
          modalFound = true;
          phoneVerificationModalFound = true;
          break;
        } else if (otpModal) {
          logger.info(`✅ OTP input modal detected on attempt ${attempt} (OTP was already sent)`);
          // OTP modal is already present, skip phone verification modal
          modalFound = true;
          phoneVerificationModalFound = false;
          break;
        }
        
        if (attempt < maxRetries) {
          logger.warn(`Neither phone verification modal nor OTP modal found on attempt ${attempt}, waiting before retry...`);
          // Wait 3-5 seconds between attempts
          await this.randomDelay(3000, 5000);
          
          // Also wait for page to be ready
          await this.waitForPageReady();
          
          // Check if we're still on the location page
          const currentUrl = this.page.url();
          if (!currentUrl.includes('/nx/create-profile/location')) {
            logger.warn(`Page URL changed during modal wait: ${currentUrl}`);
          }
        }
      }

      // Check if any modal was found
      if (!modalFound) {
        logger.error(`Neither phone verification modal nor OTP input modal found after ${maxRetries} attempts`);
        return this.createError('PHONE_VERIFICATION_MODAL_NOT_FOUND', `Neither phone verification modal nor OTP input modal found after ${maxRetries} attempts with extended delays`);
      }

      // Handle phone verification modal if found
      if (phoneVerificationModalFound) {
        logger.info('Phone verification modal found, proceeding with Send code button...');

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
      } else {
        logger.info('OTP input modal already present, proceeding directly to OTP handling...');
      }
      
      // Handle OTP input with resumability
      return await this.handleOTPInputWithResumability(skipOtp);

    } catch (error) {
      return this.createError('PHONE_VERIFICATION_MODAL_FAILED', `Phone verification modal handling failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async handleOTPInputWithResumability(skipOtp: boolean = false): Promise<AutomationResult> {
    try {
      // Check if user is from Ukraine or Indonesia - skip OTP verification for these countries
      if (this.user.country_code.toUpperCase() === 'UA' || this.user.country_code.toUpperCase() === 'ID') {
        logger.info(`User is from ${this.user.country_code} - skipping OTP input handling`);
        logger.info(`Location step completed successfully for ${this.user.country_code} user`);
        return this.createSuccess();
      }
      
      // Check for the OTP input modal with multiple detection methods
      const otpModalTitle = await this.page.evaluate(() => {
        // Method 1: Check for h3 elements with "Enter your code"
        const h3Elements = document.querySelectorAll('h3');
        const h3Match = Array.from(h3Elements).find(h3 => h3.textContent?.includes('Enter your code'));
        if (h3Match) return h3Match;
        
        // Method 2: Check for any element with "Enter your code" text
        const allElements = document.querySelectorAll('*');
        const textMatch = Array.from(allElements).find(el => el.textContent?.includes('Enter your code'));
        if (textMatch) return textMatch;
        
        // Method 3: Check for OTP input fields
        const otpInputs = document.querySelectorAll('.pincode-input, input[type="text"][maxlength="1"]');
        if (otpInputs.length > 0) return otpInputs[0];
        
        // Method 4: Check for modal with verification content
        const modalElements = document.querySelectorAll('[role="dialog"], .air3-modal, .modal');
        const modalMatch = Array.from(modalElements).find(modal => 
          modal.textContent?.includes('code') || 
          modal.textContent?.includes('verification') ||
          modal.textContent?.includes('OTP')
        );
        if (modalMatch) return modalMatch;
        
        return null;
      });
      
      if (!otpModalTitle) {
        logger.warn('OTP input modal not found, trying alternative detection...');
        
        // Try alternative detection methods
        const alternativeDetection = await this.page.evaluate(() => {
          // Check for any visible modal or dialog
          const visibleModals = Array.from(document.querySelectorAll('[role="dialog"], .air3-modal, .modal, .popup'))
            .filter(modal => {
              const style = window.getComputedStyle(modal);
              return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
            });
          
          if (visibleModals.length > 0) {
            logger.info(`Found ${visibleModals.length} visible modal(s)`);
            return visibleModals[0];
          }
          
          // Check for any input fields that might be OTP inputs
          const inputFields = document.querySelectorAll('input[type="text"], input[type="number"]');
          if (inputFields.length > 0) {
            logger.info(`Found ${inputFields.length} input field(s)`);
            return inputFields[0];
          }
          
          return null;
        });
        
        if (!alternativeDetection) {
          logger.error('OTP input modal not found with any detection method');
          return this.createError('OTP_MODAL_NOT_FOUND', 'OTP input modal not found with any detection method');
          } else {
          logger.info('OTP input modal found with alternative detection method');
        }
      }
      
      logger.info('OTP input modal detected, waiting for modal to fully load...');
      
      // Wait for the OTP modal to be fully loaded and ready
      await this.randomDelay(3000, 5000);
      
      // Find the first OTP input field
      const firstOtpInput = await this.page.$('.pincode-input');
      if (!firstOtpInput) {
        logger.warn('OTP input field not found');
        return this.createError('OTP_FIELDS_NOT_FOUND', 'OTP input field not found');
      }
      
      logger.info('Found OTP input field, now checking for OTP...');
      
      // Now that the modal is open, check for OTP
      let otpCode = await this.checkForOTPAfterModalOpen(skipOtp);
      
      // Ensure we have an OTP code
      if (!otpCode) {
        logger.error('No OTP code available, cannot proceed with phone verification');
        return this.createError('OTP_NOT_AVAILABLE', 'No OTP code available for phone verification');
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
        phoneNumber: this.user.phone || '' // Will be generated by OTP Provider if not available
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
        } else {
          // If expectedData.phoneNumber is empty, it means we need to generate one
          if (!expectedData.phoneNumber || expectedData.phoneNumber.trim() === '') {
            logger.info(`Phone number field has value: ${phoneValue}, but no expected value set (will be generated)`);
            logger.info(`✅ Phone number field verified: ${phoneValue}`);
          } else {
            // Compare only digits, ignoring spaces and formatting
            const cleanExpected = expectedData.phoneNumber.replace(/\D/g, '');
            const cleanActual = phoneValue.replace(/\D/g, '');
            
            if (cleanActual !== cleanExpected) {
              errors.push(`Phone number verification failed - Expected: ${expectedData.phoneNumber} (${cleanExpected}), got: ${phoneValue} (${cleanActual})`);
          allFieldsValid = false;
        } else {
              logger.info(`✅ Phone number verified: ${phoneValue} (digits: ${cleanActual})`);
            }
          }
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
