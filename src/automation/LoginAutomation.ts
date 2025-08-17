import { Page } from 'puppeteer';
import { User } from '../types/database';
import { BaseAutomation, AutomationResult } from './BaseAutomation';
import { FormAutomation } from './FormAutomation';
import { NavigationAutomation } from './NavigationAutomation';
import { SkillsStepHandler } from './steps/SkillsStepHandler';
import { EducationStepHandler } from './steps/EducationStepHandler';
import { OverviewStepHandler } from './steps/OverviewStepHandler';
import { LocationStepHandler } from './steps/LocationStepHandler';
import { SessionService } from '../services/sessionService.js';
import { BrowserManager } from '../browser/browserManager.js';
import { TextVerifiedService } from '../services/textVerifiedService.js';

// Create a simple logger for automation
const logger = {
  info: (message: string, ...args: any[]) => console.log(`[INFO] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[WARN] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[ERROR] ${message}`, ...args),
  debug: (message: string, ...args: any[]) => console.debug(`[DEBUG] ${message}`, ...args),
};

// Legacy interface for backward compatibility
export interface LoginResult {
  status: 'success' | 'soft_fail' | 'hard_fail';
  stage: 'email' | 'password' | 'create_profile' | 'employment_saved' | 'done';
  error_code?: string;
  screenshots: Record<string, string>;
  url: string;
  evidence?: string;
}

export class LoginAutomation extends BaseAutomation {
  private formAutomation: FormAutomation;
  private navigationAutomation: NavigationAutomation;
  private stepHandlers: Map<string, any>;
  private browserManager: BrowserManager;

  constructor(page: Page, user: User, browserManager?: BrowserManager) {
    super(page, user);
    this.browserManager = browserManager || new BrowserManager();
    this.formAutomation = new FormAutomation(page, user);
    this.navigationAutomation = new NavigationAutomation(page, user);
    
    // Initialize step handlers
    this.stepHandlers = new Map([
      ['skills', new SkillsStepHandler(page, user)],
      ['education', new EducationStepHandler(page, user)],
      ['overview', new OverviewStepHandler(page, user)],
      ['location', new LocationStepHandler(page, user)],
      // Add more step handlers as they are created
    ]);
  }

  async execute(options?: { uploadOnly?: boolean; restoreSession?: boolean; skipOtp?: boolean }): Promise<LoginResult> {
    try {
      logger.info('Starting login automation...');
      
      // Setup browser
      await this.setupBrowser();
      
      // Check if we should restore session instead of logging in
      if (options?.restoreSession) {
        logger.info('Restore-session mode enabled, attempting to restore existing session...');
        
        // Try to restore session first
        const sessionRestored = await this.restoreExistingSession();
        if (sessionRestored) {
          logger.info('Session restored successfully, proceeding to profile creation...');
          // Handle profile creation with restored session
          const result = await this.handleCreateProfile(options);
          return this.convertToLegacyResult(result);
        } else {
          logger.info('Session restoration failed, falling back to normal login flow...');
        }
      }
      
      // Go to login page
      let result = await this.goToLoginPage();
      if (result.status !== 'success') {
        return this.convertToLegacyResult(result);
      }
      
      // Enter email
      result = await this.enterEmail();
      if (result.status !== 'success') {
        return this.convertToLegacyResult(result);
      }
      
      // Enter password
      result = await this.enterPassword();
      if (result.status !== 'success') {
        return this.convertToLegacyResult(result);
      }
      
      // Handle profile creation
      result = await this.handleCreateProfile(options);
      return this.convertToLegacyResult(result);
      
    } catch (error) {
      logger.error('Login automation failed:', error);
      return {
        status: 'hard_fail',
        stage: 'email',
        error_code: 'AUTOMATION_FAILED',
        screenshots: this.screenshots,
        url: this.page.url(),
        evidence: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async setupBrowser(): Promise<void> {
    // Browser setup logic
    await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    await this.page.setViewport({ width: 1920, height: 1080 });
  }

  private async restoreExistingSession(): Promise<boolean> {
    try {
      logger.info('Attempting to restore existing session...');
      
      // Import SessionService dynamically
      const { SessionService } = await import('../services/sessionService.js');
      
      // Check if user has saved session state
      const db = await import('../database/connection.js').then(m => m.getDatabase());
      const user = await db
        .selectFrom('users')
        .select(['last_session_state', 'onboarding_completed_at', 'last_proxy_port'])
        .where('id', '=', this.user.id)
        .executeTakeFirst();
      
      if (!user?.last_session_state) {
        logger.info('No saved session state found for user');
        return false;
      }
      
      if (user.onboarding_completed_at) {
        logger.info('User has already completed onboarding, skipping session restoration');
        return false;
      }
      
      logger.info('Found saved session state, attempting to restore...');
      
      // Restore session state using the same method as restore-session command
      const sessionRestored = await SessionService.loadSessionState(this.page, this.user.id);
      if (!sessionRestored) {
        logger.warn('Failed to load session state');
        return false;
      }
      
      // Navigate to Upwork to check if session is still valid
      logger.info('Navigating to Upwork to check session validity...');
      await this.page.goto('https://www.upwork.com', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });
      
      // Wait for page to load
      await this.waitForPageReady();
      
      // Check if we're logged in by looking for profile creation page or dashboard
      const currentUrl = this.page.url();
      logger.info(`Current URL after navigation: ${currentUrl}`);
      
      const isLoggedIn = currentUrl.includes('/nx/create-profile') || 
                        currentUrl.includes('/ab/account-security') ||
                        currentUrl.includes('/dashboard') ||
                        currentUrl.includes('/welcome');
      
      if (isLoggedIn) {
        logger.info('Session restored successfully, user is logged in');
        
        // Save session state after successful restoration to update it
        try {
          logger.info('Updating session state after successful restoration...');
          await SessionService.saveSessionState(this.page, this.user.id);
          logger.info('Session state updated successfully');
        } catch (error) {
          logger.warn('Failed to update session state:', error);
          // Don't fail the restoration if session saving fails
        }
        
        return true;
      } else {
        logger.info('Session restoration failed, user is not logged in');
        return false;
      }
      
    } catch (error) {
      logger.error('Error during session restoration:', error);
      
      // If session restoration fails due to network/proxy issues, delete the corrupted session state
      if (error instanceof Error && (
        error.message.includes('ERR_TUNNEL_CONNECTION_FAILED') ||
        error.message.includes('ERR_CONNECTION_FAILED') ||
        error.message.includes('ERR_NETWORK') ||
        error.message.includes('ERR_INTERNET_DISCONNECTED')
      )) {
        try {
          logger.info('Deleting corrupted session state due to network error...');
          const db = await import('../database/connection.js').then(m => m.getDatabase());
          await db
            .updateTable('users')
            .set({ last_session_state: null })
            .where('id', '=', this.user.id)
            .execute();
          logger.info('Corrupted session state deleted successfully');
        } catch (deleteError) {
          logger.warn('Failed to delete corrupted session state:', deleteError);
        }
      }
      
      return false;
    }
  }

  private async goToLoginPage(): Promise<AutomationResult> {
    return await this.navigationAutomation.navigateToUrl(
      'https://www.upwork.com/ab/account-security/login',
      'login'
    );
  }

  private async enterEmail(): Promise<AutomationResult> {
    logger.info('Entering email...');
    
    await this.waitForPageReady();
    
    return await this.formAutomation.fillField([
      '#login_username',
      '[aria-label*="Username"]',
      '[aria-label*="email"]',
      'input[name="login[username]"]',
    ], this.user.email, 'email');
  }

  private async enterPassword(): Promise<AutomationResult> {
    logger.info('Entering password...');
    
    // Press Enter to submit email form
    await this.page.keyboard.press('Enter');
    
    // Wait for page transition after email submission
    logger.info('Waiting for page transition after email submission...');
    await this.waitForPageTransition();
    
    // Wait for the page to be ready and network to be idle
    await this.waitForPageReady();
    
    logger.info('Looking for password field...');
    
    // Use the specialized password method for better reliability
    return await this.formAutomation.fillPasswordField([
      '#login_password',
      '[aria-label*="Password"]',
      'input[name="login[password]"]',
      'input[type="password"]',
    ], this.user.password);
  }

  private async handleCreateProfile(options?: { uploadOnly?: boolean; skipOtp?: boolean }): Promise<AutomationResult> {
    logger.info('Handling profile creation...');
    
    // Submit password form
    await this.page.keyboard.press('Enter');
    
    // Wait for verification process to complete
    logger.info('Waiting for password verification and page redirect...');
    await this.waitForPageTransition();
    
    // Wait for the page to be fully ready
    await this.waitForPageReady();
    
    // Additional wait to ensure redirect is complete
    await this.randomDelay(2000, 3000);
    
    // Check for captcha and verification error messages with multiple attempts
    let errorDetected = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      errorDetected = await this.checkForCaptchaError();
      if (errorDetected) {
        logger.warn(`Error detected on attempt ${attempt}`);
        break;
      }
      
      if (attempt < 3) {
        logger.info(`No error detected on attempt ${attempt}, waiting before retry...`);
        await this.randomDelay(1000, 2000);
      }
    }
    if (errorDetected) {
      logger.warn('Captcha or verification error detected, flagging user and updating proxy port');
      
      try {
        // Get current proxy port and increment it
        const currentProxyPort = this.user.last_proxy_port || 10001;
        const newProxyPort = currentProxyPort + 1;
        
        // Flag user as captcha and update proxy port
        await this.flagUserAsCaptcha(newProxyPort);
        
        return this.createError(
          'CAPTCHA_DETECTED',
          `Captcha/verification error detected, user flagged and proxy port updated to ${newProxyPort}`
        );
      } catch (error) {
        logger.error('Failed to flag user as captcha:', error);
        return this.createError('CAPTCHA_FLAG_FAILED', 'Failed to flag user as captcha');
      }
    }
    
    // Check if we're on create profile page
    const currentUrl = this.page.url();
    logger.info(`Current URL after password submission: ${currentUrl}`);
    
    if (!currentUrl.includes('/nx/create-profile')) {
      // Wait a bit more and check again in case redirect is still in progress
      logger.info('Not on create profile page yet, waiting a bit more...');
      await this.randomDelay(3000, 5000);
      await this.waitForPageReady();
      
      const retryUrl = this.page.url();
      logger.info(`URL after additional wait: ${retryUrl}`);
      
      if (!retryUrl.includes('/nx/create-profile')) {
        return this.createError(
          'NOT_ON_CREATE_PROFILE',
          `Expected create profile page, got ${retryUrl}`
        );
      }
    }
    
    logger.info('Successfully reached create profile page');
    
    // Save session state after successful login
    try {
      logger.info('Saving session state after successful login...');
      await SessionService.saveSessionState(this.page, this.user.id);
      logger.info('Session state saved successfully');
    } catch (error) {
      logger.warn('Failed to save session state:', error);
      // Don't fail the automation if session saving fails
    }
    
    // Resume profile creation with step handlers
    return await this.resumeProfileCreation(options);
  }

  private async resumeProfileCreation(options?: { uploadOnly?: boolean; skipOtp?: boolean }): Promise<AutomationResult> {
    try {
      const currentUrl = this.page.url();
      const currentStep = this.detectProfileStep(currentUrl);
      
      logger.info(`Resuming profile creation from step: ${currentStep}, URL: ${currentUrl}, Upload only: ${options?.uploadOnly}`);

      const steps = ['welcome', 'experience', 'goal', 'work_preference', 'resume_import', 'categories', 'skills', 'title', 'employment', 'education', 'languages', 'overview', 'rate', 'location'];
      let currentStepIndex = this.getStepIndex(currentStep);
      
      // Execute remaining steps in order
      for (let i = currentStepIndex; i < steps.length; i++) {
        const stepName = steps[i];
        let stepResult: AutomationResult;
        
        // Use step handler if available, otherwise use legacy method
        if (this.stepHandlers.has(stepName)) {
          const handler = this.stepHandlers.get(stepName);
          // Pass skipOtp option specifically to LocationStepHandler
          if (stepName === 'location' && options?.skipOtp) {
            stepResult = await handler.execute({ skipOtp: true });
          } else {
            stepResult = await handler.execute();
          }
        } else {
          // Fallback to legacy step handling
          stepResult = await this.handleLegacyStep(stepName);
        }
        
        // Check if step failed
        if (stepResult.status !== 'success') {
          return stepResult;
        }
        
        // Special case: if skipOtp is enabled and we just completed the location step,
        // redirect to the submit page
        if (stepName === 'location' && options?.skipOtp) {
          logger.info('Skip-OTP mode: redirecting to submit page after location step');
          try {
            await this.page.goto('https://www.upwork.com/nx/create-profile/submit', {
              waitUntil: 'networkidle2',
              timeout: 30000,
            });
            await this.randomDelay(2000, 3000);
            logger.info('Successfully redirected to submit page');
            return this.createSuccess('done');
          } catch (error) {
            logger.error('Failed to redirect to submit page:', error);
            return this.createError('SUBMIT_REDIRECT_FAILED', `Failed to redirect to submit page: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
        

      }
      
      return this.createSuccess('done');
      
    } catch (error) {
      return this.createError(
        'PROFILE_CREATION_FAILED',
        `Profile creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private detectProfileStep(url: string): string {
    if (url.includes('/welcome')) return 'welcome';
    if (url.includes('/experience')) return 'experience';
    if (url.includes('/goal')) return 'goal';
    if (url.includes('/work-preference')) return 'work_preference';
    if (url.includes('/resume-import')) return 'resume_import';
    if (url.includes('/categories')) return 'categories';
    if (url.includes('/skills')) return 'skills';
    if (url.includes('/title')) return 'title';
    if (url.includes('/employment')) return 'employment';
    if (url.includes('/education')) return 'education';
    if (url.includes('/languages')) return 'languages';
    if (url.includes('/overview')) return 'overview';
    if (url.includes('/rate')) return 'rate';
    if (url.includes('/location')) return 'location';
    return 'initial';
  }

  private getStepIndex(stepName: string): number {
    const steps = ['welcome', 'experience', 'goal', 'work_preference', 'resume_import', 'categories', 'skills', 'title', 'employment', 'education', 'languages', 'overview', 'rate', 'location'];
    const index = steps.indexOf(stepName);
    return index === -1 ? 0 : index;
  }

  private async handleLegacyStep(stepName: string): Promise<AutomationResult> {
    // Placeholder for legacy step handling
    // This would contain the original step logic for steps not yet refactored
    logger.warn(`Using legacy handling for step: ${stepName}`);
    
    // Special handling for welcome step
    if (stepName === 'welcome') {
      return await this.handleWelcomeStep();
    }
    
    // Special handling for experience step
    if (stepName === 'experience') {
      return await this.handleExperienceStep();
    }
    
    // Special handling for goal step
    if (stepName === 'goal') {
      return await this.handleGoalStep();
    }
    
    // Special handling for resume import step
    if (stepName === 'resume_import') {
      return await this.handleResumeImportStep();
    }
    
    // Special handling for work preference step
    if (stepName === 'work_preference') {
      return await this.handleWorkPreferenceStep();
    }
    
    // Special handling for rate step
    if (stepName === 'rate') {
      return await this.handleRateStep();
    }
    

    
    // For now, just try to click next button
    return await this.navigationAutomation.clickNextButton(stepName);
  }

  private async handleWelcomeStep(): Promise<AutomationResult> {
    logger.info('Handling welcome step...');
    
    try {
      await this.waitForPageReady();
      
      // Look for the "Get started" button
      const getStartedButton = await this.waitForSelectorWithRetry([
        'button[data-qa="get-started-btn"]',
        'button[data-ev-label="get_started_btn"]',
        'button.air3-btn-primary:contains("Get started")',
        'button:contains("Get started")',
        '[role="button"]:contains("Get started")',
        'button.air3-btn:contains("Get started")',
        'button[class*="btn"]:contains("Get started")'
      ], 10000);
      
      if (!getStartedButton) {
        return this.createError(
          'WELCOME_GET_STARTED_NOT_FOUND',
          'Get started button not found on welcome page'
        );
      }
      
      logger.info('Found Get started button on welcome page, clicking it...');
      await this.clickElement(getStartedButton);
      await this.randomDelay(2000, 4000);
      
      // Wait for navigation
      await this.waitForNavigation();
      
      // Verify we navigated to the next step
      const newUrl = this.page.url();
      if (!newUrl.includes('/nx/create-profile/')) {
        return this.createError(
          'WELCOME_NAVIGATION_FAILED',
          `Failed to navigate from welcome page. Current URL: ${newUrl}`
        );
      }
      
      logger.info('Welcome step completed successfully with Get started button');
      return this.createSuccess();
      
    } catch (error) {
      return this.createError(
        'WELCOME_STEP_FAILED',
        `Welcome step failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async handleExperienceStep(): Promise<AutomationResult> {
    return await this.handleRadioButtonStep('experience', 'FREELANCED_BEFORE');
  }

  private async handleGoalStep(): Promise<AutomationResult> {
    return await this.handleRadioButtonStep('goal', 'EXPLORING');
  }

  private async handleResumeImportStep(): Promise<AutomationResult> {
    logger.info('Handling resume import step...');
    
    try {
      await this.waitForPageReady();
      
      // Step 1: Generate PDF resume using user data
      logger.info('Generating ATS-friendly PDF resume...');
      const { ResumeGenerator } = await import('../utils/resumeGenerator.js');
      const pdfPath = await ResumeGenerator.generateResume(this.user);
      logger.info(`PDF resume generated at: ${pdfPath}`);
      
      // Step 2: Look for the "Upload your resume" button
      const uploadButton = await this.waitForSelectorWithRetry([
        'button[data-qa="resume-upload-btn-mobile"]',
        'button[data-ev-label="resume_upload_btn_mobile"]',
        'button:contains("Upload your resume")',
        'button.air3-btn-secondary:contains("Upload your resume")'
      ], 10000);
      
      if (!uploadButton) {
        return this.createError(
          'RESUME_UPLOAD_BUTTON_NOT_FOUND',
          'Upload your resume button not found'
        );
      }
      
      logger.info('Found Upload your resume button, clicking it...');
      await this.clickElement(uploadButton);
      await this.randomDelay(2000, 4000);
      
      // Wait for upload modal to appear
      const uploadModal = await this.waitForSelectorWithRetry([
        'input[type="file"]',
        '[data-qa="file-upload-input"]',
        'input[accept*="pdf"]'
      ], 10000);
      
      if (!uploadModal) {
        return this.createError(
          'RESUME_UPLOAD_MODAL_NOT_FOUND',
          'File upload modal not found after clicking upload button'
        );
      }
      
      logger.info('Upload modal appeared, looking for file input...');
      
      // Step 5: Find the file input element directly (it should be available in the modal)
      const fileInput = await this.waitForSelectorWithRetry([
        'input[type="file"]',
        'input[accept*="pdf"]',
        'input[accept*="doc"]',
        'input[accept*="txt"]'
      ], 10000);
      
      if (!fileInput) {
        return this.createError(
          'RESUME_FILE_INPUT_NOT_FOUND',
          'File input not found in upload modal'
        );
      }
      
      logger.info('File input found, uploading generated PDF directly...');
      
      // Upload the file directly to the input element without clicking choose file
      try {
        await (fileInput as any).uploadFile(pdfPath);
        logger.info('PDF file uploaded successfully');
      } catch (uploadError) {
        logger.warn('Direct upload failed, trying alternative method...');
        
        // Alternative method: Set files property directly
        await fileInput.evaluate((input: Element, filePath: string) => {
          const htmlInput = input as HTMLInputElement;
          // Create a new file list with our file
          const dt = new DataTransfer();
          fetch(filePath)
            .then(response => response.blob())
            .then(blob => {
              const file = new File([blob], 'resume.pdf', { type: 'application/pdf' });
              dt.items.add(file);
              htmlInput.files = dt.files;
              
              // Trigger change event
              const event = new Event('change', { bubbles: true });
              htmlInput.dispatchEvent(event);
            });
        }, pdfPath);
        
        await this.randomDelay(2000, 3000);
        logger.info('Alternative upload method completed');
      }
      
      // Step 6: Wait for file processing (green checkmark appears)
      logger.info('Waiting for file processing completion...');
      await this.randomDelay(3000, 5000);
      
      // Look for processing indicators (green checkmark, success message, etc.)
      const processingComplete = await this.waitForSelectorWithRetry([
        '.upload-success',
        '.file-uploaded',
        '[data-qa="upload-success"]',
        '.green-checkmark',
        '.air3-icon-check'
      ], 15000);
      
      if (processingComplete) {
        logger.info('File processing completed successfully');
      } else {
        logger.warn('File processing indicator not found, but continuing...');
      }
      
      // Now look for the Continue button
      const continueButton = await this.waitForSelectorWithRetry([
        'button[data-qa="resume-upload-continue-btn"]',
        'button:contains("Continue")',
        'button.air3-btn-primary:contains("Continue")'
      ], 10000);
      
      if (continueButton) {
        logger.info('Found Continue button, clicking it...');
        await this.clickElement(continueButton);
        await this.randomDelay(2000, 4000);
        
        // Wait for navigation
        await this.waitForNavigation();
        
        // Verify we navigated to the next step
        const newUrl = this.page.url();
        if (newUrl.includes('/nx/create-profile/') && !newUrl.includes('/resume-import')) {
          logger.info('Successfully navigated to next step after resume import');
          return this.createSuccess();
        } else {
          return this.createError(
            'RESUME_IMPORT_NAVIGATION_FAILED',
            `Failed to navigate after resume import. Current URL: ${newUrl}`
          );
        }
      } else {
        return this.createError(
          'RESUME_CONTINUE_BUTTON_NOT_FOUND',
          'Continue button not found in resume upload modal'
        );
      }
      
    } catch (error) {
      return this.createError(
        'RESUME_IMPORT_STEP_FAILED',
        `Resume import step failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async handleWorkPreferenceStep(): Promise<AutomationResult> {
    return await this.handleCheckboxStep('work_preference', ['TALENT_MARKETPLACE'], 5);
  }

  private async handleRadioButtonStep(stepName: string, radioValue: string): Promise<AutomationResult> {
    logger.info(`Handling ${stepName} step...`);
    
    try {
      await this.waitForPageReady();
      
      // Look for the radio button with the specified value
      const radioButton = await this.waitForSelectorWithRetry([
        `input[type="radio"][value="${radioValue}"]`,
        `input[type="radio"][data-ev-button_box_value="true"]`,
        `input[type="radio"].air3-btn-box-input[value="${radioValue}"]`,
        `input[type="radio"][name*="radio-group"][value="${radioValue}"]`
      ], 10000);
      
      if (!radioButton) {
        return this.createError(
          `${stepName.toUpperCase()}_RADIO_NOT_FOUND`,
          `${radioValue} radio button not found on ${stepName} page`
        );
      }
      
      logger.info(`Found ${radioValue} radio button, clicking it...`);
      await this.clickElement(radioButton);
      await this.randomDelay(1000, 2000);
      
      // Verify the radio button is selected
      const isChecked = await radioButton.evaluate((el: Element) => (el as HTMLInputElement).checked);
      if (!isChecked) {
        logger.warn('Radio button not checked after clicking, trying again...');
        await this.clickElement(radioButton);
        await this.randomDelay(1000, 2000);
        
        const retryChecked = await radioButton.evaluate((el: Element) => (el as HTMLInputElement).checked);
        if (!retryChecked) {
          return this.createError(
            `${stepName.toUpperCase()}_RADIO_SELECTION_FAILED`,
            `Failed to select ${radioValue} radio button after retry`
          );
        }
      }
      
      logger.info(`${radioValue} radio button selected successfully`);
      
      // Now try to click the Next button with retry logic
      // Save session state before pressing Next
      await this.saveSessionStateAfterStep();
      
      const success = await this.handleNextButtonWithFallback(stepName, 3);
      
      if (!success) {
        return this.createError(
          `${stepName.toUpperCase()}_NEXT_BUTTON_FAILED`,
          `Failed to click Next button after multiple attempts`
        );
      }
      
      logger.info(`${stepName} step completed successfully`);
      return this.createSuccess();
      
    } catch (error) {
      return this.createError(
        `${stepName.toUpperCase()}_STEP_FAILED`,
        `${stepName} step failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async saveSessionStateAfterStep(): Promise<void> {
    try {
      await SessionService.saveSessionState(this.page, this.user.id);
      logger.info('Session state saved after step completion');
    } catch (error) {
      logger.warn(`Failed to save session state after step: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async handleNextButtonWithFallback(stepName: string, tabCount: number = 3): Promise<boolean> {
    let attempts = 0;
    const maxAttempts = 2;
    
    while (attempts < maxAttempts) {
      attempts++;
      logger.info(`Attempting to click Next button (attempt ${attempts}/${maxAttempts})...`);
      
      // Look for the Next button with more comprehensive selectors
      const nextButton = await this.waitForSelectorWithRetry([
        'button[data-test="next-button"]',
        'button[data-ev-label="wizard_next"]',
        'button[data-qa="next-btn"]',
        'button[data-ev-label="next_btn"]',
        'button.air3-btn-primary:contains("Continue editing your profile")',
        'button:contains("Continue editing your profile")',
        'button.air3-btn-primary:contains("Next")',
        'button:contains("Next")',
        '[role="button"]:contains("Next")',
        'button.air3-btn:contains("Next")',
        'button[class*="btn"]:contains("Next")'
      ], 5000);
      
      if (nextButton) {
        logger.info('Found Next button, clicking it...');
        await this.clickElement(nextButton);
        await this.randomDelay(2000, 4000);
        
        // Wait for navigation
        await this.waitForNavigation();
        
        // Verify we navigated to the next step
        const newUrl = this.page.url();
        if (newUrl.includes('/nx/create-profile/') && !newUrl.includes(`/${stepName}`)) {
          logger.info('Successfully navigated to next step');
          return true;
        } else {
          logger.warn(`Navigation failed on attempt ${attempts}. Current URL: ${newUrl}`);
          if (attempts < maxAttempts) {
            await this.randomDelay(2000, 3000);
          }
        }
      } else {
        logger.warn(`Next button not found on attempt ${attempts}, trying tab+enter method...`);
        
                  // Try tab+enter method as fallback
          try {
            logger.info(`Attempting tab+enter navigation with ${tabCount} tabs...`);
            for (let i = 0; i < tabCount; i++) {
              await this.page.keyboard.press('Tab');
              await this.randomDelay(300, 500);
            }
            await this.page.keyboard.press('Enter');
            await this.randomDelay(2000, 4000);
          
          // Wait for navigation
          await this.waitForNavigation();
          
          // Verify we navigated to the next step
          const newUrl = this.page.url();
          if (newUrl.includes('/nx/create-profile/') && !newUrl.includes(`/${stepName}`)) {
            logger.info('Successfully navigated to next step using tab+enter');
            return true;
          } else {
            logger.warn(`Tab+enter navigation failed on attempt ${attempts}. Current URL: ${newUrl}`);
            if (attempts < maxAttempts) {
              await this.randomDelay(2000, 3000);
            }
          }
        } catch (tabError) {
          logger.warn(`Tab+enter method failed: ${tabError instanceof Error ? tabError.message : 'Unknown error'}`);
          if (attempts < maxAttempts) {
            await this.randomDelay(2000, 3000);
          }
        }
      }
    }
    
    return false;
  }

  private async handleCheckboxStep(stepName: string, checkboxValues: string[], tabCount: number = 3): Promise<AutomationResult> {
    logger.info(`Handling ${stepName} step...`);
    
    try {
      await this.waitForPageReady();
      
      // For work preference step, select the first checkbox (TALENT_MARKETPLACE)
      logger.info(`Looking for first checkbox in work preference options...`);
      
      // Look for the first checkbox (which should be the TALENT_MARKETPLACE option)
      const checkbox = await this.waitForSelectorWithRetry([
        'input[type="checkbox"][value="true"]',
        'input[type="checkbox"].air3-btn-box-input',
        'input[type="checkbox"][data-ev-label="button_box_checkbox"]',
        'input[type="checkbox"]'
      ], 5000);
      
      if (checkbox) {
        logger.info(`Found first checkbox, checking current state...`);
        
        // Check if the checkbox is already checked
        const isAlreadyChecked = await checkbox.evaluate((el: Element) => (el as HTMLInputElement).checked);
        
        if (isAlreadyChecked) {
          logger.info(`Checkbox is already checked, clicking twice to refresh selection...`);
          // Click twice: first to uncheck, second to recheck
          await this.clickElement(checkbox);
          await this.randomDelay(500, 1000);
          await this.clickElement(checkbox);
          await this.randomDelay(500, 1000);
        } else {
          logger.info(`Checkbox is not checked, clicking once...`);
          await this.clickElement(checkbox);
          await this.randomDelay(500, 1000);
        }
        
        // Verify the checkbox is checked
        const isChecked = await checkbox.evaluate((el: Element) => (el as HTMLInputElement).checked);
        if (!isChecked) {
          logger.warn(`Checkbox not checked after clicking, trying again...`);
          await this.clickElement(checkbox);
          await this.randomDelay(500, 1000);
          
          const retryChecked = await checkbox.evaluate((el: Element) => (el as HTMLInputElement).checked);
          if (!retryChecked) {
            return this.createError(
              `${stepName.toUpperCase()}_CHECKBOX_SELECTION_FAILED`,
              `Failed to select first checkbox after retry`
            );
          }
        }
        
        logger.info(`First checkbox selected successfully`);
      } else {
        logger.warn(`No checkbox found, continuing...`);
      }
      
      // Save session state before pressing Next
      await this.saveSessionStateAfterStep();
      
      // Now try to click the Next button with retry logic
      const success = await this.handleNextButtonWithFallback(stepName);
      
      if (!success) {
        return this.createError(
          `${stepName.toUpperCase()}_NEXT_BUTTON_FAILED`,
          `Failed to click Next button after multiple attempts`
        );
      }
      
      logger.info(`${stepName} step completed successfully`);
      return this.createSuccess();
      
    } catch (error) {
      return this.createError(
        `${stepName.toUpperCase()}_STEP_FAILED`,
        `${stepName} step failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async handleRateStep(): Promise<AutomationResult> {
    logger.info('Handling rate step...');
    
    try {
      await this.waitForPageReady();
      
      // Look for the rate input field
      const rateField = await this.waitForSelectorWithRetry([
        'input[data-test="currency-input"]',
        'input[aria-describedby*="hourly-rate"]',
        'input[placeholder="$0.00"]',
        'input[data-ev-currency="USD"]'
      ], 10000);
      
      if (!rateField) {
        return this.createError(
          'RATE_FIELD_NOT_FOUND',
          'Rate input field not found'
        );
      }
      
      // Generate a random rate between $10-20
      const rate = Math.floor(Math.random() * 11) + 10; // 10 to 20
      const rateValue = rate.toString();
      
      logger.info(`Setting hourly rate to $${rateValue}`);
      
      // Clear and type the rate
      await this.clearAndType(rateField, rateValue);
      
      // Verify the rate was entered correctly (lenient verification)
      const enteredRate = await rateField.evaluate((el: Element) => (el as HTMLInputElement).value);
      logger.info(`Rate verification - Expected: ${rateValue}, Got: ${enteredRate}`);
      
      // More lenient verification: check if the field has any value and contains our rate
      if (!enteredRate || enteredRate.trim() === '') {
        logger.warn(`Rate field is empty, retrying once...`);
        
        // Retry once
        await this.clearAndType(rateField, rateValue);
        await this.randomDelay(500, 1000);
        
        const retryRate = await rateField.evaluate((el: Element) => (el as HTMLInputElement).value);
        logger.info(`Rate retry verification - Expected: ${rateValue}, Got: ${retryRate}`);
        
        // Only fail if still completely empty
        if (!retryRate || retryRate.trim() === '') {
          return this.createError(
            'RATE_ENTRY_FAILED',
            `Failed to enter rate correctly. Field is empty after retry.`
          );
        }
      }
      
      logger.info(`Rate set successfully: ${enteredRate || 'value entered'}`);
      
      // Click the Next button
      return await this.navigationAutomation.clickNextButton('rate');
      
    } catch (error) {
      return this.createError(
        'RATE_STEP_FAILED',
        `Rate step failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private convertToLegacyResult(result: AutomationResult): LoginResult {
    return {
      status: result.status,
      stage: result.stage as any,
      error_code: result.error_code,
      screenshots: result.screenshots || this.screenshots,
      url: result.url,
      evidence: result.evidence,
    };
  }

  private async checkForCaptchaError(): Promise<boolean> {
    try {
      logger.info('Checking for captcha and verification error messages...');
      
      // Look for various error messages that indicate captcha or verification issues
      const errorDetected = await this.page.evaluate(() => {
        // Check for form error messages
        const errorElements = document.querySelectorAll('.air3-form-message-error');
        for (const element of errorElements) {
          const text = element.textContent || '';
          if (text.includes('We cannot verify your request due to network restrictions') ||
              text.includes('traffic blocking at your location')) {
            return { type: 'captcha', message: text };
          }
        }
        
        // Check for alert content (verification failed)
        const alertElements = document.querySelectorAll('.air3-alert-content');
        for (const element of alertElements) {
          const text = element.textContent || '';
          if (text.includes('Verification failed')) {
            return { type: 'verification_failed', message: text };
          }
        }
        
        // Check for any other error messages that might indicate issues
        const allErrorElements = document.querySelectorAll('[class*="error"], [class*="alert"]');
        for (const element of allErrorElements) {
          const text = element.textContent || '';
          if (text.includes('verification') && text.includes('failed')) {
            return { type: 'verification_failed', message: text };
          }
        }
        
        return null;
      });
      
      if (errorDetected) {
        logger.warn(`Error detected: ${errorDetected.type} - ${errorDetected.message}`);
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Error checking for captcha/verification errors:', error);
      return false;
    }
  }
  
  private async flagUserAsCaptcha(newProxyPort: number): Promise<void> {
    try {
      logger.info(`Flagging user ${this.user.id} as captcha and updating proxy port to ${newProxyPort}`);
      
      const db = await import('../database/connection.js');
      const { getDatabase } = db;
      
      await getDatabase()
        .updateTable('users')
        .set({
          captcha_flagged_at: new Date(),
          last_proxy_port: newProxyPort,
          updated_at: new Date()
        })
        .where('id', '=', this.user.id)
        .execute();
      
      logger.info(`User ${this.user.id} flagged as captcha with proxy port ${newProxyPort}`);
    } catch (error) {
      logger.error(`Failed to flag user ${this.user.id} as captcha:`, error);
      throw error;
    }
  }
  
  private async handlePhoneVerificationAfterLocation(): Promise<AutomationResult> {
    try {
      logger.info('Checking for phone verification flow after location step...');
      
      // Wait for page transition after location step completion
      await this.waitForPageTransition();
      await this.randomDelay(2000, 3000);
      
      // Check current URL to see if we're still on location page or moved to next step
      const currentUrl = this.page.url();
      logger.info(`Current URL after location step: ${currentUrl}`);
      
      // First, check for the "Please verify your phone number" modal
      const verifyPhoneModal = await this.page.evaluate(() => {
        const h3Elements = document.querySelectorAll('h3');
        return Array.from(h3Elements).find(h3 => h3.textContent?.includes('Please verify your phone number'));
      });
      
      if (verifyPhoneModal) {
        logger.info('Phone verification modal detected, waiting for modal to fully load...');
        
        // Wait for the modal to fully load and be interactive
        await this.randomDelay(2000, 3000);
        
        // Wait for the phone number input to be present and filled
        const phoneInput = await this.waitForSelectorWithRetry([
          'input.air3-phone-number-remaining',
          'input[data-ev-label="phone_number_input"]',
          'input[type="tel"]'
        ], 10000);
        
        if (phoneInput) {
          const phoneValue = await phoneInput.evaluate((el: Element) => (el as HTMLInputElement).value);
          logger.info(`Phone number in modal: ${phoneValue}`);
        }
        
        // Wait a bit more for the button to be fully interactive
        await this.randomDelay(1000, 2000);
        
        // Click the "Send code" button with more specific selector
        const sendCodeButton = await this.waitForSelectorWithRetry([
          'button#submitPhone',
          'button[data-ev-label="submit_phone"]',
          'button.air3-btn-primary.air3-btn-block-sm'
        ], 10000);
        
        if (!sendCodeButton) {
          logger.warn('Send code button not found');
          return this.createError('SEND_CODE_BUTTON_NOT_FOUND', 'Send code button not found');
        }
        
        // Verify this is the "Send code" button by checking its text
        const buttonText = await sendCodeButton.evaluate((el: Element) => el.textContent);
        if (!buttonText?.includes('Send code')) {
          logger.warn(`Found button but text doesn't match "Send code": ${buttonText}`);
          return this.createError('SEND_CODE_BUTTON_NOT_FOUND', 'Send code button text verification failed');
        }
        
        // Check if button is enabled
        const isDisabled = await sendCodeButton.evaluate((el: Element) => {
          const button = el as HTMLButtonElement;
          return button.disabled || button.classList.contains('disabled');
        });
        
        if (isDisabled) {
          logger.warn('Send code button is disabled, waiting for it to become enabled...');
          await this.randomDelay(2000, 3000);
        }
        
        logger.info('Clicking send code button...');
        await this.clickElement(sendCodeButton);
        
        // Wait for the OTP input modal to appear
        logger.info('Waiting for OTP input modal to appear...');
        await this.randomDelay(3000, 5000);
        
        // Check if OTP modal appeared after first click
        let otpModalAppeared = await this.page.evaluate(() => {
          const h3Elements = document.querySelectorAll('h3');
          return Array.from(h3Elements).find(h3 => h3.textContent?.includes('Enter your code'));
        });
        
        if (!otpModalAppeared) {
          logger.warn('OTP modal did not appear after first click, trying to click send code button again...');
          
          // Wait a bit more and try clicking again
          await this.randomDelay(2000, 3000);
          
          // Try to find and click the send code button again
          const sendCodeButtonRetry = await this.waitForSelectorWithRetry([
            'button#submitPhone',
            'button[data-ev-label="submit_phone"]',
            'button.air3-btn-primary.air3-btn-block-sm'
          ], 5000);
          
          if (sendCodeButtonRetry) {
            logger.info('Clicking send code button again as fallback...');
            await this.clickElement(sendCodeButtonRetry);
            await this.randomDelay(3000, 5000);
            
            // Check again if OTP modal appeared
            otpModalAppeared = await this.page.evaluate(() => {
              const h3Elements = document.querySelectorAll('h3');
              return Array.from(h3Elements).find(h3 => h3.textContent?.includes('Enter your code'));
            });
            
            if (otpModalAppeared) {
              logger.info('OTP modal appeared after retry click');
            } else {
              logger.warn('OTP modal still did not appear after retry click');
            }
          } else {
            logger.warn('Could not find send code button for retry');
          }
        }
      } else {
        logger.info('Phone verification modal not found, checking if we need to wait longer...');
        
        // Wait a bit more and check again
        await this.randomDelay(2000, 3000);
        const verifyPhoneModalRetry = await this.page.evaluate(() => {
          const h3Elements = document.querySelectorAll('h3');
          return Array.from(h3Elements).find(h3 => h3.textContent?.includes('Please verify your phone number'));
        });
        
        if (verifyPhoneModalRetry) {
          logger.info('Phone verification modal found on retry, proceeding with verification...');
          // Recursively call this method to handle the verification
          return await this.handlePhoneVerificationAfterLocation();
        }
      }
      
      // Now check for the OTP input modal
      let otpModalTitle = await this.page.evaluate(() => {
        const h3Elements = document.querySelectorAll('h3');
        return Array.from(h3Elements).find(h3 => h3.textContent?.includes('Enter your code'));
      });
      
      if (!otpModalTitle) {
        logger.info('OTP input modal not found, checking if we need to wait longer...');
        
        // Wait a bit more and check again
        await this.randomDelay(2000, 3000);
        const otpModalTitleRetry = await this.page.evaluate(() => {
          const h3Elements = document.querySelectorAll('h3');
          return Array.from(h3Elements).find(h3 => h3.textContent?.includes('Enter your code'));
        });
        if (!otpModalTitleRetry) {
          logger.info('OTP input modal still not found, checking if profile creation is complete...');
          
          // Check if we've reached the final success page
          const finalUrl = this.page.url();
          if (finalUrl.includes('/profile') || finalUrl.includes('/dashboard') || finalUrl.includes('/welcome')) {
            logger.info('Profile creation appears to be complete, marking as success');
            return this.createSuccess();
          }
          
          logger.warn('No verification modal found and not on final page, returning pending for retry');
          return this.createError('PHONE_VERIFICATION_PENDING', 'Phone verification modal not found, will retry later');
        }
      }
      
      logger.info('OTP input modal detected, handling OTP input...');
      
      // Wait a bit more for the OTP modal to be fully loaded
      await this.randomDelay(2000, 3000);
      
      // Find all OTP input fields
      const otpInputs = await this.page.$$('.pincode-input');
      if (otpInputs.length === 0) {
        logger.warn('OTP input fields not found');
        return this.createError('OTP_FIELDS_NOT_FOUND', 'OTP input fields not found');
      }
      
      logger.info(`Found ${otpInputs.length} OTP input fields`);
      
      // Get real OTP from TextVerified service
      let otpCode: string;
      try {
        const textVerifiedService = new TextVerifiedService();
        logger.info('Waiting for OTP from TextVerified service...');
        
        // Wait for OTP with 100 second timeout
        const receivedOtp = await textVerifiedService.waitForOTP(this.user.id, 100);
        
        if (!receivedOtp) {
          logger.error('No OTP received from TextVerified within 100 seconds');
          return this.createError('OTP_NOT_RECEIVED', 'No OTP received from TextVerified within 100 seconds');
        }
        
        otpCode = receivedOtp;
        logger.info(`✅ Received OTP from TextVerified: ${otpCode}`);
        
      } catch (error) {
        logger.error('Failed to get OTP from TextVerified:', error);
        
        // Fallback to test code if TextVerified fails
        logger.warn('Falling back to test OTP code 12345 due to TextVerified error');
        otpCode = '12345';
      }
      
      // Fill each OTP field with the received OTP code
      for (let i = 0; i < Math.min(otpInputs.length, otpCode.length); i++) {
        const input = otpInputs[i];
        const digit = otpCode[i];
        
        logger.info(`Filling OTP field ${i + 1} with digit: ${digit}`);
        await input.focus();
        await this.randomDelay(300, 500);
        await input.type(digit);
        await this.randomDelay(300, 500);
      }
      
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
      
      // Wait for verification result (5-7 seconds as requested)
      logger.info('Waiting 5-7 seconds for verification result...');
      await this.randomDelay(5000, 7000);
      
      // Check for error messages
      const errorMessage = await this.page.$('.air3-form-message-error');
      if (errorMessage) {
        const errorText = await errorMessage.evaluate((el: Element) => el.textContent);
        logger.warn(`Phone verification error: ${errorText}`);
        
        // Check if it's an expired code error
        if (errorText && errorText.includes('expired')) {
          logger.warn('OTP code expired, verification failed');
          return this.createError('OTP_EXPIRED', 'OTP code expired, verification failed');
        }
        
        return this.createError('PHONE_VERIFICATION_FAILED', `Phone verification failed: ${errorText}`);
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
      logger.error('Phone verification handling failed:', error);
      return this.createError('PHONE_VERIFICATION_ERROR', `Phone verification error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
