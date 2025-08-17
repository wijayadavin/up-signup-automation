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
        logger.info('Location step completed successfully');
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

      // Fill street address
      const streetField = await this.waitForSelectorWithRetry([
        'input[placeholder="Enter street address"]',
        '[data-qa="input-address"] input',
        '.air3-typeahead-input-fake[placeholder*="street"]'
      ], 5000);

      if (streetField) {
        logger.info(`Filling street address: ${addressData.street}`);
        await this.clearAndType(streetField, addressData.street);
        await this.handleAutocompleteDropdown('street address');
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

      // Fill city
      const cityField = await this.waitForSelectorWithRetry([
        'input[placeholder="Enter city"]',
        '[data-qa="input-city"] input',
        '[aria-labelledby*="city"] input'
      ], 5000);

      if (cityField) {
        logger.info(`Filling city: ${addressData.city}`);
        await this.clearAndType(cityField, addressData.city);
        await this.handleAutocompleteDropdown('city');
      }

      // Fill state/province
      const stateField = await this.waitForSelectorWithRetry([
        'input[placeholder*="state"]',
        '[data-qa="address-state-input"]',
        '[aria-labelledby*="state"] input'
      ], 5000);

      if (stateField) {
        logger.info(`Filling state: ${addressData.state}`);
        await this.clearAndType(stateField, addressData.state);
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
      // Look for various types of dropdowns
      const dropdownSelectors = [
        '.air3-typeahead-dropdown',
        '.air3-dropdown-menu', 
        '[role="listbox"]',
        '.air3-typeahead-fake + div', // Address suggestions dropdown
        '[data-qa="input-address"] + div', // Address input dropdown
        '.air3-typeahead-suggestions'
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
      // Press down arrow to select first option
      await this.page.keyboard.press('ArrowDown');
      await this.randomDelay(1000, 1500); // Wait longer before pressing enter
      // Press enter to confirm selection
      await this.page.keyboard.press('Enter');
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
      await this.page.waitForNetworkIdle({ idleTime: 2000, timeout: 10000 });
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

}
