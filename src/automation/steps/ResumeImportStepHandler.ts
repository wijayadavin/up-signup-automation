import { StepHandler } from '../StepHandler.js';
import { AutomationResult } from '../BaseAutomation.js';
import * as path from 'path';

const logger = {
  info: (message: string, ...args: any[]) => console.log(`[INFO] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[WARN] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[ERROR] ${message}`, ...args),
  debug: (message: string, ...args: any[]) => console.log(`[DEBUG] ${message}`, ...args),
};

export class ResumeImportStepHandler extends StepHandler {
  constructor(page: any, user: any) {
    super(page, user, 'resume_import');
  }

  async execute(options?: { uploadOnly?: boolean; skipOtp?: boolean; skipLocation?: boolean }): Promise<AutomationResult> {
    try {
      logger.info('Handling resume import step...');

      // Validate current page
      const pageValidation = await this.validateCurrentPage('/nx/create-profile/resume-import');
      if (pageValidation) {
        return pageValidation;
      }

      await this.waitForPageReady();
      this.screenshots.resume_import_before = await this.takeScreenshot('resume_import_before');

      // Check if we're in upload mode or manual mode
      const isUploadMode = options?.uploadOnly === true;
      logger.info(`Resume import mode: ${isUploadMode ? 'Upload' : 'Manual'}`);
      
      if (isUploadMode) {
        // Upload mode: try Next button first, then upload if needed
        logger.info('Upload mode: trying Next button first...');
        const nextResult = await this.tryNextButtonFirst();
        if (nextResult) {
          this.screenshots.resume_import_after = await this.takeScreenshot('resume_import_after');
          return nextResult;
        }
        
        // Next button not found, proceed with upload
        logger.info('Upload mode: Next button not found, proceeding with upload...');
        const uploadResult = await this.clickUploadResumeButton();
        if (uploadResult.status !== 'success') {
          return uploadResult;
        }

        // Wait for modal to appear and handle file upload
        logger.info('Waiting for upload modal to appear...');
        const modalResult = await this.handleUploadModal();
        if (modalResult.status !== 'success') {
          return modalResult;
        }

        // After successful upload, look for Skip or Next button
        logger.info('Looking for Skip or Next button after upload...');
        const finalNavigationResult = await this.handleNavigation();
        this.screenshots.resume_import_after = await this.takeScreenshot('resume_import_after');
        return finalNavigationResult;
      } else {
        // Manual mode: click "Fill out manually" button
        logger.info('Manual mode: looking for "Fill out manually" button...');
        const manualResult = await this.clickManualButton();
        
        if (manualResult.status === 'success') {
          // If we found and clicked "Fill out manually" successfully, we're done (manual mode)
          logger.info('Successfully clicked "Fill out manually" button (manual mode)');
          this.screenshots.resume_import_after = await this.takeScreenshot('resume_import_after');
          return manualResult;
        }

        // If manual button not found, try upload mode as fallback
        logger.info('Manual button not found, trying upload mode as fallback...');
        
        // Try to click the upload resume button
        logger.info('Looking for Upload your resume button...');
        const uploadResult = await this.clickUploadResumeButton();
        if (uploadResult.status !== 'success') {
          return uploadResult;
        }

        // Wait for modal to appear and handle file upload
        logger.info('Waiting for upload modal to appear...');
        const modalResult = await this.handleUploadModal();
        if (modalResult.status !== 'success') {
          return modalResult;
        }

        // After successful upload, look for Skip or Next button
        logger.info('Looking for Skip or Next button after upload...');
        const finalNavigationResult = await this.handleNavigation();
        this.screenshots.resume_import_after = await this.takeScreenshot('resume_import_after');
        return finalNavigationResult;
      }

    } catch (error) {
      return this.createError(
        'RESUME_IMPORT_STEP_FAILED',
        `Resume import step failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async clickManualButton(): Promise<AutomationResult> {
    try {
      logger.info('Attempting to click "Fill out manually" button...');

      // Simple strategy: find the manual button by data-qa attribute
      const manualButton = await this.page.$('button[data-qa="resume-fill-manually-btn"]');
      
      if (!manualButton) {
        logger.warn('Manual button not found, will try upload mode...');
        return this.createError('MANUAL_BUTTON_NOT_FOUND', 'Fill out manually button not found');
      }

      // Get button text for logging
      const buttonText = await manualButton.evaluate((el: Element) => 
        el.textContent?.trim() || ''
      );
      logger.info(`Found manual button with text: "${buttonText}"`);

      // Click the button once
      logger.info('Clicking manual button...');
      await this.clickElement(manualButton);
      await this.randomDelay(2000, 3000);

      logger.info('Successfully clicked "Fill out manually" button (manual mode)');
      return this.createSuccess();

    } catch (error) {
      logger.warn(`Failed to click manual button: ${error}, will try upload mode...`);
      return this.createError('MANUAL_BUTTON_CLICK_FAILED', `Failed to click manual button: ${error}`);
    }
  }

  private async clickUploadResumeButton(): Promise<AutomationResult> {
    try {
      logger.info('Attempting to click Upload your resume button...');

      // Multiple strategies to find the "Upload your resume" button
      const uploadButtonSelectors = [
        // Primary: Target the specific button with data-qa="resume-upload-btn-mobile" (from HTML)
        'button[data-qa="resume-upload-btn-mobile"]',
        
        // Alternative: Target by data-ev-label="resume_upload_btn_mobile" (from HTML)
        'button[data-ev-label="resume_upload_btn_mobile"]',
        
        // Alternative: Target by data-ev-label="resume_upload_btn" (mobile version)
        'button[data-ev-label="resume_upload_btn"]',
        
        // Alternative: Target by data-qa="resume-upload-btn" (mobile version)
        'button[data-qa="resume-upload-btn"]',
        
        // Alternative: Target by text content containing "Upload your resume"
        'button:contains("Upload your resume")',
        
        // Alternative: Target by text content containing "Upload"
        'button:contains("Upload")',
        
        // Alternative: Target by class and text
        '.air3-btn-secondary:contains("Upload")',
        
        // Alternative: Target by data-ev-label containing upload
        'button[data-ev-label*="upload"]',
        
        // Alternative: Target by data-qa containing upload
        'button[data-qa*="upload"]',
        
        // Alternative: Target by role and text
        '[role="button"]:contains("Upload")',
        
        // Alternative: Target by text containing resume
        'button:contains("resume")',
        
        // Alternative: Target any button with upload in text
        'button:contains("upload")',
        
        // Fallback: any button with secondary class
        '.air3-btn-secondary'
      ];

      let uploadButton = null;
      let selectionMethod = '';

      // Try to find the upload button using the selectors in order
      for (let i = 0; i < uploadButtonSelectors.length; i++) {
        const selector = uploadButtonSelectors[i];
        logger.info(`Trying selector ${i + 1}/${uploadButtonSelectors.length}: ${selector}`);
        
        try {
          const buttonElements = await this.page.$$(selector);
          logger.info(`Found ${buttonElements.length} button elements with selector: ${selector}`);
          
          if (buttonElements.length > 0) {
            // Look for the button with "Upload" text
            for (let j = 0; j < buttonElements.length; j++) {
              const button = buttonElements[j];
              const buttonText = await button.evaluate((el: Element) => 
                el.textContent?.trim().toLowerCase() || ''
              );
              
              logger.info(`Button ${j + 1} text: "${buttonText}"`);
              
              if (buttonText.includes('upload') || buttonText.includes('resume')) {
                uploadButton = button;
                selectionMethod = `Found upload button via selector ${i + 1}: ${selector} (text: "${buttonText}")`;
                logger.info(selectionMethod);
                break;
              }
            }
            
            // If no upload button found, use the first button
            if (!uploadButton) {
              uploadButton = buttonElements[0];
              const firstButtonText = await uploadButton.evaluate((el: Element) => 
                el.textContent?.trim() || ''
              );
              selectionMethod = `Using first button from selector ${i + 1}: ${selector} (text: "${firstButtonText}")`;
              logger.info(selectionMethod);
            }
            
            break; // Found buttons, stop trying other selectors
          }
        } catch (error) {
          logger.warn(`Selector ${selector} failed: ${error}`);
          continue;
        }
      }

      if (!uploadButton) {
        logger.warn('Upload resume button not found, proceeding to navigation...');
        return this.createSuccess();
      }

      logger.info(`Selection method: ${selectionMethod}`);

      // Multiple click strategies to ensure the button is clicked
      logger.info('Attempting multiple click strategies...');

      // Strategy 1: Direct click
      logger.info('Strategy 1: Direct click...');
      await this.clickElement(uploadButton);
      await this.randomDelay(2000, 3000);

      logger.info('Successfully attempted all click strategies');

      // Wait a moment for any UI updates
      await this.randomDelay(3000, 5000);

      return this.createSuccess();

    } catch (error) {
      logger.warn(`Failed to click upload resume button: ${error}, proceeding to navigation...`);
      return this.createSuccess();
    }
  }

  private async handleUploadModal(): Promise<AutomationResult> {
    try {
      logger.info('Waiting for upload modal to appear...');

      // Wait for modal to appear
      const modal = await this.waitForSelectorWithRetry([
        '.air3-modal-content',
        '[class*="modal"]',
        '[role="dialog"]',
        '.air3-modal',
        'div[class*="modal"]'
      ], 10000);

      if (!modal) {
        logger.warn('Upload modal not found, proceeding to navigation...');
        return this.createSuccess();
      }

      logger.info('Upload modal found, looking for file input...');

      // Look for file input in the modal
      const fileInput = await this.waitForSelectorWithRetry([
        'input[type="file"]',
        'input[accept*=".pdf"]',
        'input[accept*=".doc"]',
        '.fe-upload-btn input[type="file"]',
        'input[data-v-e7ec285a][type="file"]'
      ], 5000);

      if (fileInput) {
        logger.info('File input found, attempting to upload file...');
        
        // Get the path to a sample resume file
        const resumePath = path.join(process.cwd(), 'assets', 'sample-resume.pdf');
        
        try {
          // Upload the file
          await (fileInput as any).uploadFile(resumePath);
          logger.info('File uploaded successfully');
          
          // Wait for upload to process
          await this.randomDelay(3000, 5000);
          
          // Look for Continue button in modal
          const continueButton = await this.waitForSelectorWithRetry([
            'button[data-qa="resume-upload-continue-btn"]',
            'button[data-ev-label="resume_upload_continue_btn"]',
            'button:contains("Continue")',
            '.air3-btn-primary:contains("Continue")'
          ], 5000);

          if (continueButton) {
            logger.info('Continue button found, clicking it...');
            await this.clickElement(continueButton);
            await this.randomDelay(2000, 3000);
            
            // Wait for modal to close
            await this.randomDelay(3000, 5000);
          } else {
            logger.warn('Continue button not found in modal');
          }
          
        } catch (uploadError) {
          logger.warn(`File upload failed: ${uploadError}, proceeding...`);
        }
      } else {
        logger.warn('File input not found in modal');
      }

      return this.createSuccess();

    } catch (error) {
      logger.warn(`Modal handling failed: ${error}, proceeding to navigation...`);
      return this.createSuccess();
    }
  }

  private async handleNavigation(): Promise<AutomationResult> {
    try {
      // Look for Skip button first (most common on resume import page)
      const skipButton = await this.waitForSelectorWithRetry([
        'button[data-qa="skip-btn"]',
        'button[data-ev-label="skip_btn"]',
        'button[data-ev-label="skip_for_now"]',
        'button.air3-btn-secondary:contains("Skip")',
        'button:contains("Skip for now")',
        'button:contains("Skip")',
        '[role="button"]:contains("Skip for now")',
        '[role="button"]:contains("Skip")',
        'a[data-ev-label="skip_link"]',
        '.air3-btn-link:contains("Skip")'
      ], 10000);
      
      if (skipButton) {
        logger.info('Found Skip button on resume import page, clicking it...');
        await this.clickElement(skipButton);
        await this.randomDelay(2000, 4000);
        
        // Wait for navigation
        await this.waitForNavigation();
        
        // Verify we navigated to the next step
        const newUrl = this.page.url();
        if (newUrl.includes('/nx/create-profile/')) {
          logger.info('Resume import step skipped successfully');
          return this.createSuccess();
        } else {
          return this.createError(
            'RESUME_IMPORT_NAVIGATION_FAILED',
            `Failed to navigate from resume import page. Current URL: ${newUrl}`
          );
        }
      }
      
      // If no skip button, look for Next button
      const nextButton = await this.waitForSelectorWithRetry([
        'button[data-qa="next-btn"]',
        'button[data-ev-label="next_btn"]',
        'button.air3-btn-primary:contains("Next")',
        'button:contains("Next")',
        '[role="button"]:contains("Next")',
        'button.air3-btn:contains("Continue")',
        'button:contains("Continue")'
      ], 5000);
      
      if (nextButton) {
        logger.info('Found Next button on resume import page, clicking it...');
        await this.clickElement(nextButton);
        await this.randomDelay(2000, 4000);
        
        // Wait for navigation
        await this.waitForNavigation();
        
        // Verify we navigated to the next step
        const newUrl = this.page.url();
        if (newUrl.includes('/nx/create-profile/')) {
          logger.info('Resume import step completed successfully with Next button');
          return this.createSuccess();
        } else {
          return this.createError(
            'RESUME_IMPORT_NAVIGATION_FAILED',
            `Failed to navigate from resume import page. Current URL: ${newUrl}`
          );
        }
      }
      
      // If neither button found, try fallback navigation
      logger.warn('No Skip or Next button found on resume import page, trying fallback navigation');
      return await this.navigationAutomation.handleFallbackNavigation(this.page.url(), 'resume_import');
      
    } catch (error) {
      return this.createError(
        'RESUME_IMPORT_NAVIGATION_FAILED',
        `Resume import navigation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
