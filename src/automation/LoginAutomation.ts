import { Page } from 'puppeteer';
import { User } from '../types/database';
import { BaseAutomation, AutomationResult } from './BaseAutomation';
import { FormAutomation } from './FormAutomation';
import { NavigationAutomation } from './NavigationAutomation';
import { SkillsStepHandler } from './steps/SkillsStepHandler';
import { EducationStepHandler } from './steps/EducationStepHandler';
import { OverviewStepHandler } from './steps/OverviewStepHandler';
// import { LocationStepHandler } from './steps/LocationStepHandler'; // TODO: Re-enable when location step is fixed
import { SessionService } from '../services/sessionService.js';

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

  constructor(page: Page, user: User) {
    super(page, user);
    this.formAutomation = new FormAutomation(page, user);
    this.navigationAutomation = new NavigationAutomation(page, user);
    
    // Initialize step handlers
    this.stepHandlers = new Map([
      ['skills', new SkillsStepHandler(page, user)],
      ['education', new EducationStepHandler(page, user)],
      ['overview', new OverviewStepHandler(page, user)],
      // ['location', new LocationStepHandler(page, user)], // TODO: Re-enable when location step is fixed
      // Add more step handlers as they are created
    ]);
  }

  async execute(options?: { uploadOnly?: boolean }): Promise<LoginResult> {
    try {
      logger.info('Starting login automation...');
      
      // Setup browser
      await this.setupBrowser();
      
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

  private async handleCreateProfile(options?: { uploadOnly?: boolean }): Promise<AutomationResult> {
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
    
    // Resume profile creation with step handlers
    return await this.resumeProfileCreation(options);
  }

  private async resumeProfileCreation(options?: { uploadOnly?: boolean }): Promise<AutomationResult> {
    try {
      const currentUrl = this.page.url();
      const currentStep = this.detectProfileStep(currentUrl);
      
      logger.info(`Resuming profile creation from step: ${currentStep}, URL: ${currentUrl}, Upload only: ${options?.uploadOnly}`);

      const steps = ['experience', 'goal', 'work_preference', 'resume_import', 'categories', 'skills', 'title', 'employment', 'education', 'languages', 'overview', 'rate', 'location'];
      let currentStepIndex = this.getStepIndex(currentStep);
      
      // Execute remaining steps in order
      for (let i = currentStepIndex; i < steps.length; i++) {
        const stepName = steps[i];
        let stepResult: AutomationResult;
        
        // Use step handler if available, otherwise use legacy method
        if (this.stepHandlers.has(stepName)) {
          const handler = this.stepHandlers.get(stepName);
          stepResult = await handler.execute();
        } else {
          // Fallback to legacy step handling
          stepResult = await this.handleLegacyStep(stepName);
        }
        
        // Check if step failed
        if (stepResult.status !== 'success') {
          return stepResult;
        }
        
        // Special handling for location step - skip for now and save session state
        if (stepName === 'location') {
          logger.info('Location step reached - SKIPPING FOR NOW (TODO: Fix location step)');
          logger.info('Marking onboarding as completed and saving session state...');
          
          try {
            // Mark onboarding as completed
            await SessionService.markOnboardingCompleted(this.user.id);
            
            // Save session state
            await SessionService.saveSessionState(this.page, this.user.id);
            
            logger.info('Onboarding marked as completed and session state saved');
            return this.createSuccess('done');
          } catch (error) {
            logger.error('Failed to mark onboarding as completed or save session state:', error);
            return this.createError('SESSION_SAVE_FAILED', 'Failed to save session state');
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
    const steps = ['experience', 'goal', 'work_preference', 'resume_import', 'categories', 'skills', 'title', 'employment', 'education', 'languages', 'overview', 'rate', 'location'];
    const index = steps.indexOf(stepName);
    return index === -1 ? 0 : index;
  }

  private async handleLegacyStep(stepName: string): Promise<AutomationResult> {
    // Placeholder for legacy step handling
    // This would contain the original step logic for steps not yet refactored
    logger.warn(`Using legacy handling for step: ${stepName}`);
    
    // Special handling for rate step
    if (stepName === 'rate') {
      return await this.handleRateStep();
    }
    
    // Special handling for location step - skip for now
    if (stepName === 'location') {
      logger.info('Location step reached in legacy handler - SKIPPING FOR NOW (TODO: Fix location step)');
      logger.info('Marking onboarding as completed and saving session state...');
      
      try {
        // Mark onboarding as completed
        await SessionService.markOnboardingCompleted(this.user.id);
        
        // Save session state
        await SessionService.saveSessionState(this.page, this.user.id);
        
        logger.info('Onboarding marked as completed and session state saved');
        return this.createSuccess('done');
      } catch (error) {
        logger.error('Failed to mark onboarding as completed or save session state:', error);
        return this.createError('SESSION_SAVE_FAILED', 'Failed to save session state');
      }
    }
    
    // For now, just try to click next button
    return await this.navigationAutomation.clickNextButton(stepName);
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
      
      // Verify the rate was entered correctly
      const enteredRate = await rateField.evaluate((el: Element) => (el as HTMLInputElement).value);
      if (enteredRate !== rateValue) {
        logger.warn(`Rate verification failed. Expected: ${rateValue}, Got: ${enteredRate}`);
        
        // Retry once
        await this.clearAndType(rateField, rateValue);
        const retryRate = await rateField.evaluate((el: Element) => (el as HTMLInputElement).value);
        if (retryRate !== rateValue) {
          return this.createError(
            'RATE_ENTRY_FAILED',
            `Failed to enter rate correctly. Expected: ${rateValue}, Got: ${retryRate}`
          );
        }
      }
      
      logger.info(`Rate set successfully: $${enteredRate}`);
      
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
      
      // Find all OTP input fields
      const otpInputs = await this.page.$$('.pincode-input');
      if (otpInputs.length === 0) {
        logger.warn('OTP input fields not found');
        return this.createError('OTP_FIELDS_NOT_FOUND', 'OTP input fields not found');
      }
      
      logger.info(`Found ${otpInputs.length} OTP input fields`);
      
      // Fill each OTP field with test code "12345"
      const testCode = '12345';
      for (let i = 0; i < Math.min(otpInputs.length, testCode.length); i++) {
        const input = otpInputs[i];
        const digit = testCode[i];
        
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
      
      // Wait for verification result
      await this.randomDelay(3000, 5000);
      
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
