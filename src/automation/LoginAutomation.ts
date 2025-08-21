import { Page, ElementHandle } from 'puppeteer';
import { User } from '../types/database';
import { BaseAutomation, AutomationResult } from './BaseAutomation';
import { FormAutomation } from './FormAutomation';
import { NavigationAutomation } from './NavigationAutomation';
import { SkillsStepHandler } from './steps/SkillsStepHandler';
import { EducationStepHandler } from './steps/EducationStepHandler';
import { LanguagesStepHandler } from './steps/LanguagesStepHandler';
import { RateStepHandler } from './steps/RateStepHandler';
import { OverviewStepHandler } from './steps/OverviewStepHandler';
import { LocationStepHandler } from './steps/LocationStepHandler';
import { SubmitStepHandler } from './steps/SubmitStepHandler';
import { ExperienceStepHandler } from './steps/ExperienceStepHandler';
import { WelcomeStepHandler } from './steps/WelcomeStepHandler';
import { GoalStepHandler } from './steps/GoalStepHandler';
import { WorkPreferenceStepHandler } from './steps/WorkPreferenceStepHandler';
import { ResumeImportStepHandler } from './steps/ResumeImportStepHandler';
import { CategoriesStepHandler } from './steps/CategoriesStepHandler';
import { TitleStepHandler } from './steps/TitleStepHandler';
import { EmploymentStepHandler } from './steps/EmploymentStepHandler';
import { GeneralStepHandler } from './steps/GeneralStepHandler';
import { StepHandler } from './StepHandler.js';
import { SessionService } from '../services/sessionService.js';
import { BrowserManager } from '../browser/browserManager.js';
// import { TextVerifiedService } from '../services/textVerifiedService.js';

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
  stage: 'email' | 'password' | 'create_profile' | 'employment_saved' | 'done' | 'rate_completed';
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
    this.stepHandlers = new Map<string, any>([
      ['welcome', new WelcomeStepHandler(page, user)],
      ['experience', new ExperienceStepHandler(page, user)],
      ['goal', new GoalStepHandler(page, user)],
      ['work_preference', new WorkPreferenceStepHandler(page, user)],
      ['resume_import', new ResumeImportStepHandler(page, user)],
      ['categories', new CategoriesStepHandler(page, user)],
      ['title', new TitleStepHandler(page, user)],
      ['employment', new EmploymentStepHandler(page, user)],
      ['skills', new SkillsStepHandler(page, user)],
      ['education', new EducationStepHandler(page, user)],
      ['languages', new LanguagesStepHandler(page, user)],
      ['overview', new OverviewStepHandler(page, user)],
      ['rate', new RateStepHandler(page, user)],
      ['location', new LocationStepHandler(page, user)],
      ['general', new GeneralStepHandler(page, user)],
      ['submit', new SubmitStepHandler(page, user)],
      // Add more step handlers as they are created
    ]);
    
    // Log registered step handlers for debugging
    logger.info('Registered step handlers:', Array.from(this.stepHandlers.keys()));
  }

  async execute(options?: { uploadOnly?: boolean; restoreSession?: boolean; skipOtp?: boolean; skipLocation?: boolean; step?: string }): Promise<LoginResult> {
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
      
      // Go to login page (or check if already logged in)
      let result = await this.goToLoginPage();
      if (result.status !== 'success') {
        return this.convertToLegacyResult(result);
      }
      
      // Check if we're already logged in (goToLoginPage returns success if already logged in)
      const currentUrl = this.page.url();
      if (currentUrl.includes('/nx/create-profile') || currentUrl.includes('/dashboard') || currentUrl.includes('/welcome')) {
        logger.info('✅ Already logged in, skipping email/password steps...');
        // Proceed directly to profile creation
      } else {
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
      }
      
      // If specific step is requested, navigate directly to it
      if (options?.step) {
        logger.info(`Forcing navigation to step: ${options.step}`);
        await this.page.goto(`https://www.upwork.com/nx/create-profile/${options.step}`, {
          waitUntil: 'networkidle2',
          timeout: 15000,
        });
        await this.randomDelay(1000, 1700);
        
        // Verify we reached the correct step
        const currentUrl = this.page.url();
        if (!currentUrl.includes(`/nx/create-profile/${options.step}`)) {
          return this.convertToLegacyResult(this.createError(
            'FORCED_STEP_NAVIGATION_FAILED',
            `Failed to navigate to ${options.step} step, current URL: ${currentUrl}`
          ));
        }
        
        logger.info(`Successfully navigated to ${options.step} step`);
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
      
      let navigationSucceeded = true;
      try {
              await this.page.goto('https://www.upwork.com', {
          waitUntil: 'networkidle2',
            timeout: 14000,
        });
      
      // Wait for page to load
      await this.waitForPageReady();
      } catch (error) {
        logger.warn('Navigation timeout or error during session restoration, checking current URL anyway...');
        navigationSucceeded = false;
      }
      
      // Check current URL regardless of navigation success/timeout
      const currentUrl = this.page.url();
      logger.info(`Current URL after ${navigationSucceeded ? 'successful navigation' : 'navigation timeout'}: ${currentUrl}`);
      
      // Check if we're logged in by looking for profile creation page or dashboard
      const isLoggedIn = currentUrl.includes('/nx/create-profile') || 
                        currentUrl.includes('/ab/account-security') ||
                        currentUrl.includes('/dashboard') ||
                        currentUrl.includes('/welcome');
      
      if (isLoggedIn) {
        logger.info('✅ Session restored successfully, user is logged in (detected after timeout)');
        
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
        logger.info('❌ Session restoration failed, user is not logged in');
        
        // Delete the invalid session state since user is not logged in
        try {
          logger.info('Deleting invalid session state for user who is not logged in...');
          const db = await import('../database/connection.js').then(m => m.getDatabase());
          await db
            .updateTable('users')
            .set({ last_session_state: null })
            .where('id', '=', this.user.id)
            .execute();
          logger.info(`✅ Deleted invalid session state for user ${this.user.id}`);
        } catch (error) {
          logger.error('Failed to delete invalid session state:', error);
        }
        
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
    // First check if we're already logged in
    const currentUrl = this.page.url();
    logger.info(`Checking current URL before login attempt: ${currentUrl}`);
    
    if (currentUrl.includes('/nx/create-profile')) {
      logger.info('✅ Already logged in - currently on profile creation page');
      return this.createSuccess('Already logged in');
    }
    
    if (currentUrl.includes('/dashboard') || currentUrl.includes('/welcome')) {
      logger.info('✅ Already logged in - currently on dashboard/welcome page');
      return this.createSuccess('Already logged in');
    }
    
    // If not logged in, navigate to login page
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

  private async clickContinueButton(): Promise<AutomationResult> {
    logger.info('Looking for Continue button to submit email...');
    
    // Wait for the button to be properly rendered
    await this.randomDelay(1000, 2000);
    
    // Check if the specific button is present and clickable
    const continueButton = await this.page.evaluate(() => {
      const buttonSelectors = [
        'button[id="login_password_continue"]',
        'button[data-ev-label="Continue"]',
        'button[button-role="continue"]',
        'button[type="submit"]',
        'button:contains("Continue")',
        '.air3-btn-primary',
        '[data-qa="login_username_continue"]',
        'button[data-ev-label="login_username_continue"]'
      ];
      
      for (const selector of buttonSelectors) {
        const button = document.querySelector(selector);
        if (button) {
          const rect = button.getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0;
          const isEnabled = !button.hasAttribute('disabled');
          const isClickable = (button as HTMLElement).offsetParent !== null;
          
          console.log(`Button found with selector: ${selector}`);
          console.log(`- Visible: ${isVisible}, Enabled: ${isEnabled}, Clickable: ${isClickable}`);
          console.log(`- Button text: ${button.textContent?.trim()}`);
          console.log(`- Button classes: ${button.className}`);
          
          if (isVisible && isEnabled && isClickable) {
            return {
              selector,
              text: button.textContent?.trim(),
              className: button.className,
              isClickable: true
            };
          }
        }
      }
      
      return null;
    });
    
    if (continueButton && continueButton.isClickable) {
      logger.info(`✅ Found clickable Continue button: "${continueButton.text}" (${continueButton.selector})`);
      
      // Store current URL to check for changes
      const currentUrl = this.page.url();
      logger.info(`Current URL before click: ${currentUrl}`);
      
      // Try to click the button using the specific selector
      try {
        const buttonElement = await this.page.$(continueButton.selector);
        if (buttonElement) {
          // Wait for button to be ready
          await this.randomDelay(500, 1000);
          
          // Try multiple click methods with human-like behavior
          try {
            // Get button bounds for random positioning
            const buttonBounds = await buttonElement.boundingBox();
            if (buttonBounds) {
              // Calculate random position within button bounds (avoiding edges)
              const padding = 5; // Avoid clicking too close to edges
              const randomX = buttonBounds.x + padding + Math.random() * (buttonBounds.width - 2 * padding);
              const randomY = buttonBounds.y + padding + Math.random() * (buttonBounds.height - 2 * padding);
              
              logger.info(`Clicking at random position: (${Math.round(randomX)}, ${Math.round(randomY)}) within button bounds`);
              
              // Move mouse to random position first (human-like)
              const currentMousePosition = await this.page.evaluate(() => ({ x: 0, y: 0 })); // We'll get this from page
              
              // Add some natural variation to the movement path
              const steps = 10 + Math.floor(Math.random() * 5); // 10-15 steps for natural movement
              await this.page.mouse.move(randomX, randomY, { steps }); // Smooth movement
              
              // Add a small random pause like humans do before clicking
              await this.randomDelay(100, 400); // Brief pause like human
              
              // Click at random position with human-like timing
              await this.page.mouse.down();
              await this.randomDelay(50, 150); // Brief hold like human
              await this.page.mouse.up();
              logger.info('✅ Continue button clicked successfully at random position with human-like timing');
            } else {
              // Fallback to regular click if bounds not available
              await buttonElement.click();
              logger.info('✅ Continue button clicked successfully (fallback)');
            }
          } catch (clickError) {
            logger.warn(`Direct click failed: ${clickError}, trying alternative methods...`);
            
            // Try clicking with JavaScript at random position
            await this.page.evaluate((selector) => {
              const button = document.querySelector(selector);
              if (button) {
                const rect = button.getBoundingClientRect();
                const padding = 5;
                const randomX = rect.x + padding + Math.random() * (rect.width - 2 * padding);
                const randomY = rect.y + padding + Math.random() * (rect.height - 2 * padding);
                
                // Create and dispatch mouse events at random position
                const mouseDown = new MouseEvent('mousedown', {
                  bubbles: true,
                  cancelable: true,
                  clientX: randomX,
                  clientY: randomY
                });
                const mouseUp = new MouseEvent('mouseup', {
                  bubbles: true,
                  cancelable: true,
                  clientX: randomX,
                  clientY: randomY
                });
                const click = new MouseEvent('click', {
                  bubbles: true,
                  cancelable: true,
                  clientX: randomX,
                  clientY: randomY
                });
                
                button.dispatchEvent(mouseDown);
                button.dispatchEvent(mouseUp);
                button.dispatchEvent(click);
              }
            }, continueButton.selector);
            
            logger.info('✅ Continue button clicked via JavaScript at random position');
          }
          
          // Wait longer for the button click to process
          logger.info('Waiting for Continue button to process...');
          await this.randomDelay(2000, 3000);
          
          // Check if URL changed
          const newUrl = this.page.url();
          logger.info(`URL after click: ${newUrl}`);
          
          if (newUrl !== currentUrl) {
            logger.info('✅ URL changed, indicating successful navigation');
          } else {
            logger.info('URL unchanged, checking for other indicators...');
          }
          
          // Additional verification: Check if the email field is no longer visible
          const emailFieldGone = await this.page.evaluate(() => {
            const emailField = document.querySelector('#login_username, input[name="login[username]"]');
            return !emailField || (emailField as HTMLElement).offsetParent === null;
          });
          
          if (emailFieldGone) {
            logger.info('✅ Email field no longer visible, indicating successful transition');
          } else {
            logger.warn('⚠️ Email field still visible, Continue button may not have worked');
            
            // Try form submission as fallback
            logger.info('Trying form submission as fallback...');
            try {
              await this.page.evaluate(() => {
                const form = document.querySelector('form');
                if (form) {
                  // Trigger form validation first
                  const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
                  form.dispatchEvent(submitEvent);
                  
                  // If event wasn't cancelled, submit the form
                  if (!submitEvent.defaultPrevented) {
                    (form as HTMLFormElement).submit();
                  }
                }
              });
              logger.info('✅ Form submitted as fallback');
              await this.randomDelay(2000, 3000);
            } catch (submitError) {
              logger.warn(`Form submission fallback failed: ${submitError}`);
            }
          }
          
          return this.createSuccess();
        } else {
          logger.warn('Button element not found, trying JavaScript click...');
          // Try clicking with JavaScript as fallback at random position
          await this.page.evaluate((selector) => {
            const button = document.querySelector(selector);
            if (button) {
              const rect = button.getBoundingClientRect();
              const padding = 5;
              const randomX = rect.x + padding + Math.random() * (rect.width - 2 * padding);
              const randomY = rect.y + padding + Math.random() * (rect.height - 2 * padding);
              
              // Create and dispatch mouse events at random position
              const mouseDown = new MouseEvent('mousedown', {
                bubbles: true,
                cancelable: true,
                clientX: randomX,
                clientY: randomY
              });
              const mouseUp = new MouseEvent('mouseup', {
                bubbles: true,
                cancelable: true,
                clientX: randomX,
                clientY: randomY
              });
              const click = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                clientX: randomX,
                clientY: randomY
              });
              
              button.dispatchEvent(mouseDown);
              button.dispatchEvent(mouseUp);
              button.dispatchEvent(click);
            }
          }, continueButton.selector);
          
          logger.info('✅ Continue button clicked via JavaScript fallback');
          await this.randomDelay(2000, 3000);
          
          // Check if URL changed
          const newUrl = this.page.url();
          logger.info(`URL after JavaScript click: ${newUrl}`);
          
          // Additional verification: Check if the email field is no longer visible
          const emailFieldGone = await this.page.evaluate(() => {
            const emailField = document.querySelector('#login_username, input[name="login[username]"]');
            return !emailField || (emailField as HTMLElement).offsetParent === null;
          });
          
          if (emailFieldGone) {
            logger.info('✅ Email field no longer visible after JavaScript click');
          } else {
            logger.warn('⚠️ Email field still visible after JavaScript click, trying form submission...');
            try {
              await this.page.evaluate(() => {
                const form = document.querySelector('form');
                if (form) {
                  (form as HTMLFormElement).submit();
                }
              });
              logger.info('✅ Form submitted as fallback after JavaScript click');
              await this.randomDelay(2000, 3000);
            } catch (submitError) {
              logger.warn(`Form submission fallback failed: ${submitError}`);
            }
          }
          
          return this.createSuccess();
        }
      } catch (error) {
        logger.error(`Failed to click Continue button: ${error}`);
        return this.createError('CONTINUE_BUTTON_CLICK_FAILED', `Failed to click Continue button: ${error}`);
      }
    } else {
      logger.warn('❌ No clickable Continue button found, pressing Enter as fallback...');
      await this.page.keyboard.press('Enter');
      await this.randomDelay(1000, 2000);
      return this.createSuccess();
    }
  }

  private async enterPassword(): Promise<AutomationResult> {
    logger.info('Entering password...');
    
    // Click the Continue button first
    const continueResult = await this.clickContinueButton();
    if (continueResult.status !== 'success') {
      return continueResult;
    }
    
    // Wait for page transition after email submission
    logger.info('Waiting for page transition after email submission...');
    await this.waitForPageTransition();
    
    // Additional wait for the password field to appear
    logger.info('Waiting for password field to appear...');
    await this.randomDelay(3000, 5000);
    
    // Wait for the page to be ready and network to be idle
    await this.waitForPageReady();
    
    // Check if we're still on the email input page (redirected back)
    const isStillOnEmailPage = await this.page.evaluate(() => {
      const emailField = document.querySelector('#login_username, input[name="login[username]"]');
      const continueButton = document.querySelector('button[id="login_password_continue"]');
      return emailField && (emailField as HTMLElement).offsetParent !== null && 
             continueButton && (continueButton as HTMLElement).offsetParent !== null;
    });
    
    if (isStillOnEmailPage) {
      logger.warn('⚠️ Still on email input page after Continue button click - likely redirected back');
      logger.info('Retrying email input and Continue button click...');
      
      // Check if there are any validation errors
      const hasValidationErrors = await this.page.evaluate(() => {
        const errorElements = document.querySelectorAll('.error, .alert, .alert-danger, [role="alert"]');
        return errorElements.length > 0;
      });
      
      if (hasValidationErrors) {
        logger.warn('⚠️ Validation errors detected, clearing and re-entering email...');
        
        // Clear the email field and re-enter
        await this.page.evaluate(() => {
          const emailField = document.querySelector('#login_username, input[name="login[username]"]') as HTMLInputElement;
          if (emailField) {
            emailField.value = '';
            emailField.focus();
          }
        });
        
        await this.randomDelay(1000, 2000);
      }
      
      // Retry the entire email entry process
      const emailRetryResult = await this.enterEmail();
      if (emailRetryResult.status !== 'success') {
        return emailRetryResult;
      }
      
      // Try clicking Continue again with a different approach
      logger.info('Trying alternative Continue button click methods...');
      
      // Method 1: Try pressing Enter key
      try {
        await this.page.keyboard.press('Enter');
        logger.info('✅ Pressed Enter key as alternative');
        await this.randomDelay(2000, 3000);
      } catch (enterError) {
        logger.warn(`Enter key failed: ${enterError}`);
      }
      
      // Method 2: Try clicking with different selector at random position
      try {
        const clicked = await this.page.evaluate(() => {
          const buttons = document.querySelectorAll('button');
          for (const button of buttons) {
            const text = button.textContent?.trim().toLowerCase();
            if (text === 'continue' || text === 'next' || text === 'submit') {
              const rect = button.getBoundingClientRect();
              const padding = 5;
              const randomX = rect.x + padding + Math.random() * (rect.width - 2 * padding);
              const randomY = rect.y + padding + Math.random() * (rect.height - 2 * padding);
              
              // Create and dispatch mouse events at random position
              const mouseDown = new MouseEvent('mousedown', {
                bubbles: true,
                cancelable: true,
                clientX: randomX,
                clientY: randomY
              });
              const mouseUp = new MouseEvent('mouseup', {
                bubbles: true,
                cancelable: true,
                clientX: randomX,
                clientY: randomY
              });
              const click = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                clientX: randomX,
                clientY: randomY
              });
              
              button.dispatchEvent(mouseDown);
              button.dispatchEvent(mouseUp);
              button.dispatchEvent(click);
              return true;
            }
          }
          return false;
        });
        
        if (clicked) {
          logger.info('✅ Clicked Continue button with alternative method at random position');
        } else {
          logger.warn('No suitable button found for alternative click');
        }
        await this.randomDelay(2000, 3000);
      } catch (altClickError) {
        logger.warn(`Alternative click failed: ${altClickError}`);
      }
      
      // Wait again for page transition
      logger.info('Waiting for page transition after retry...');
      await this.waitForPageTransition();
      await this.randomDelay(3000, 5000);
      await this.waitForPageReady();
    }
    
    // Check if password field is already visible
    const passwordFieldVisible = await this.page.evaluate(() => {
      const passwordSelectors = [
        '#login_password',
        '[aria-label*="Password"]',
        'input[name="login[password]"]',
        'input[type="password"]'
      ];
      return passwordSelectors.some(selector => {
        const element = document.querySelector(selector);
        return element && (element as HTMLElement).offsetParent !== null; // Check if element is visible
      });
    });
    
    if (passwordFieldVisible) {
      logger.info('✅ Password field is already visible, proceeding with password entry');
    } else {
      logger.info('Password field not yet visible, continuing with state check...');
    }
    
    // Check if we're in the correct password state by looking for multiple indicators
    logger.info('Checking for password state indicators...');
    
    // Function to check password state with multiple indicators
    const checkPasswordState = async (userEmail: string) => {
      return await this.page.evaluate((email) => {
        // Indicator 1: Look for the Welcome message
        const welcomeElement = document.querySelector('h1.text-center.h3.mb-md-6x.d-none.d-md-block');
        const hasWelcomeMessage = welcomeElement && welcomeElement.textContent?.trim().includes('Welcome');
        
        // Indicator 2: Look for the email display
        const emailElement = document.querySelector('div.small.mt-2x.mb-3x.pb-2x.ellipsis.font-weight-body');
        const hasEmailDisplay = emailElement && emailElement.textContent?.trim() === email;
        
        // Indicator 3: Look for password field directly
        const passwordField = document.querySelector('#login_password, [aria-label*="Password"], input[name="login[password]"], input[type="password"]');
        const hasPasswordField = passwordField && (passwordField as HTMLElement).offsetParent !== null;
        
        // Indicator 4: Check if we're no longer on the email input page
        const emailField = document.querySelector('#login_username, input[name="login[username]"]');
        const isEmailFieldGone = !emailField || (emailField as HTMLElement).offsetParent === null;
        
        // Indicator 5: Check for password-related text on page
        const pageText = document.body.textContent || '';
        const hasPasswordText = pageText.includes('Password') || pageText.includes('password');
        
        console.log('Password state indicators:');
        console.log('- Welcome message:', hasWelcomeMessage);
        console.log('- Email display:', hasEmailDisplay);
        console.log('- Password field visible:', hasPasswordField);
        console.log('- Email field gone:', isEmailFieldGone);
        console.log('- Password text on page:', hasPasswordText);
        
        // Return true if we have multiple positive indicators
        const positiveIndicators = [hasWelcomeMessage, hasEmailDisplay, hasPasswordField, isEmailFieldGone, hasPasswordText];
        const positiveCount = positiveIndicators.filter(Boolean).length;
        
        console.log(`Positive indicators: ${positiveCount}/5`);
        
        // Consider it a password state if we have at least 3 positive indicators
        return positiveCount >= 3;
      }, userEmail);
    };
    
    // Try up to 3 times to find the password state
    let isPasswordState = false;
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.info(`Password state check attempt ${attempt}/${maxRetries}...`);
      
      isPasswordState = await checkPasswordState(this.user.email);
      
      if (isPasswordState) {
        logger.info(`✅ Password state found on attempt ${attempt}`);
        break;
      }
      
      if (attempt < maxRetries) {
        logger.warn(`Password state not found on attempt ${attempt}, waiting before retry...`);
        // Wait progressively longer between attempts (3x more delay)
        const waitTime = attempt * 6000; // 6s, 12s, 18s (was 2s, 4s, 6s)
        await this.randomDelay(waitTime, waitTime + 3000);
        await this.waitForPageReady();
      }
    }
    
    if (!isPasswordState) {
      return this.createError(
        'PASSWORD_STATE_NOT_FOUND',
        `Password state not detected after ${maxRetries} attempts - Welcome message with email not found after email submission`
      );
    }
    
    logger.info('✅ Password state confirmed - Welcome message with email found');
    
    // Now look for password field
    logger.info('Looking for password field...');
    
    // Use the specialized password method for better reliability with Enter key submission
    return await this.formAutomation.fillPasswordField([
      '#login_password',
      '[aria-label*="Password"]',
      'input[name="login[password]"]',
      'input[type="password"]',
    ], this.user.password, true); // Enable Enter key submission
  }

  private async handleCreateProfile(options?: { uploadOnly?: boolean; skipOtp?: boolean; skipLocation?: boolean; step?: string }): Promise<AutomationResult> {
    logger.info('Handling profile creation...');
    
    // Simple approach: password is already filled, just use Enter key to submit
    logger.info('Password already filled, using Enter key to submit...');
    await this.page.keyboard.press('Enter');
    logger.info('✅ Enter key pressed for password submission');
    
    // Wait for the submission to process
    await this.randomDelay(3000, 5000);
    
    // Wait for verification process to complete
    logger.info('Waiting for password verification and page redirect...');
    await this.waitForPageTransition();
    
    // Wait for the page to be fully ready
    await this.waitForPageReady();
    
    // Additional wait to ensure redirect is complete - increased wait time
    await this.randomDelay(6000, 9000);
    
    // Check if we're already on the create profile page (successful redirect)
    const initialUrl = this.page.url();
    logger.info(`Current URL after password submission: ${initialUrl}`);
    
    if (initialUrl.includes('/nx/create-profile')) {
      logger.info('✅ Successfully redirected to create profile page!');
      // Wait for the page to fully load
      await this.waitForPageReady();
      await this.randomDelay(2000, 3000);
      
      // Skip the complex verification since we're already on the right page
      logger.info('Skipping complex verification - already on create profile page');
    }
    
    // Check if we're on create profile page
    let currentUrl = this.page.url();
    logger.info(`Current URL after password submission: ${currentUrl}`);
    
    // If not redirected, try enhanced form submission as fallback
    if (!currentUrl.includes('/nx/create-profile') && !initialUrl.includes('/nx/create-profile')) {
      logger.info('Not redirected after password submit, trying enhanced form submission...');
      
      // Wait a bit more first
      await this.randomDelay(2000, 3000);
      
      // Try enhanced form submission with multiple methods
      await this.formAutomation.submitPasswordForm();
      await this.waitForPageTransition();
      await this.waitForPageReady();
      
      // Check if submission was successful (with error handling for navigation)
      let submissionSuccess = false;
      try {
        submissionSuccess = await this.formAutomation.checkFormSubmissionSuccess();
        if (submissionSuccess) {
          logger.info('✅ Form submission appears successful based on indicators');
        }
      } catch (error) {
        logger.warn(`Error checking form submission success: ${error}`);
        // If we get a navigation error, it might mean the submission worked
        if (error instanceof Error && error.message.includes('Execution context was destroyed')) {
          logger.info('Navigation detected during form submission check - likely successful');
          submissionSuccess = true;
        }
      }
      
      // Check URL again after enhanced submission
      currentUrl = this.page.url();
      logger.info(`URL after enhanced form submission: ${currentUrl}`);
      
      // If still not redirected, try one more time with longer wait
      if (!currentUrl.includes('/nx/create-profile')) {
        logger.info('Still not redirected, waiting 10 seconds and trying again...');
        await this.randomDelay(8000, 10000);
        await this.waitForPageReady();
        
        // Try enhanced form submission one more time
        await this.formAutomation.submitPasswordForm();
        await this.waitForPageTransition();
        await this.waitForPageReady();
        
        // Check submission success again (with error handling)
        let retrySubmissionSuccess = false;
        try {
          retrySubmissionSuccess = await this.formAutomation.checkFormSubmissionSuccess();
          if (retrySubmissionSuccess) {
            logger.info('✅ Form submission appears successful on retry');
          }
        } catch (error) {
          logger.warn(`Error checking form submission success on retry: ${error}`);
          if (error instanceof Error && error.message.includes('Execution context was destroyed')) {
            logger.info('Navigation detected during retry form submission check - likely successful');
            retrySubmissionSuccess = true;
          }
        }
        
        // Final URL check
        currentUrl = this.page.url();
        logger.info(`Final URL after retry: ${currentUrl}`);
      }
    }
    
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
        await this.randomDelay(300, 700);
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
    
    // Final check if we're on create profile page
    if (!currentUrl.includes('/nx/create-profile') && !initialUrl.includes('/nx/create-profile')) {
      // Wait a bit more and check again in case redirect is still in progress
      logger.info('Not on create profile page yet, waiting a bit more...');
      await this.randomDelay(3000, 5000);
      await this.waitForPageReady();
      
      const retryUrl = this.page.url();
      logger.info(`URL after additional wait: ${retryUrl}`);
      
      if (!retryUrl.includes('/nx/create-profile')) {
        logger.warn(`Still not on create profile page after extended wait. Current URL: ${retryUrl}`);
        logger.info('Waiting additional time for potential redirect...');
        await this.randomDelay(5000, 8000);
        await this.waitForPageReady();
        
        const finalUrl = this.page.url();
        logger.info(`Final URL check: ${finalUrl}`);
        
        if (!finalUrl.includes('/nx/create-profile')) {
          return this.createError(
            'NOT_ON_CREATE_PROFILE',
            `Expected create profile page, got ${finalUrl}`
          );
        }
      }
    }
    
    logger.info('Successfully reached create profile page');
    
    // Skip verification if we're already on the create profile page
    if (initialUrl.includes('/nx/create-profile')) {
      logger.info('Already on create profile page, skipping verification');
    } else {
      // Verify we're actually on the create profile page by checking for specific elements
    let isOnCreateProfilePage = false;
    try {
      isOnCreateProfilePage = await this.page.evaluate(() => {
        const indicators = [
          window.location.href.includes('/nx/create-profile'),
          document.querySelector('[data-qa="get-started-btn"]'),
          document.querySelector('.air3-welcome-page')
        ];
        
        // Check for Welcome text in h1 elements
        const h1Elements = document.querySelectorAll('h1');
        const hasWelcomeH1 = Array.from(h1Elements).some(h1 => 
          h1.textContent?.toLowerCase().includes('welcome')
        );
        
        // Check for Get Started button
        const buttons = document.querySelectorAll('button');
        const hasGetStartedButton = Array.from(buttons).some(button => 
          button.textContent?.toLowerCase().includes('get started')
        );
        
        return indicators.some(Boolean) || hasWelcomeH1 || hasGetStartedButton;
      });
    } catch (error) {
      logger.warn(`Error checking create profile page elements: ${error}`);
      if (error instanceof Error && error.message.includes('Execution context was destroyed')) {
        logger.info('Navigation detected during page verification - page is likely still loading');
        // If we get a navigation error, assume the page is still loading and continue
        isOnCreateProfilePage = true;
      }
    }
    
    if (!isOnCreateProfilePage) {
      logger.warn('URL indicates create profile page but page elements not found, waiting longer...');
      await this.randomDelay(5000, 8000);
      await this.waitForPageReady();
      
      // Final verification
      let finalVerification = false;
      try {
        finalVerification = await this.page.evaluate(() => {
          const hasGetStartedBtn = document.querySelector('[data-qa="get-started-btn"]') !== null;
          
          // Check for Welcome text in h1 elements
          const h1Elements = document.querySelectorAll('h1');
          const hasWelcomeH1 = Array.from(h1Elements).some(h1 => 
            h1.textContent?.toLowerCase().includes('welcome')
          );
          
          return window.location.href.includes('/nx/create-profile') && 
                 (hasGetStartedBtn || hasWelcomeH1);
        });
      } catch (error) {
        logger.warn(`Error during final verification: ${error}`);
        if (error instanceof Error && error.message.includes('Execution context was destroyed')) {
          logger.info('Navigation detected during final verification - page is likely still loading');
          // If we get a navigation error, assume the page is still loading and continue
          finalVerification = true;
        }
      }
      
      if (!finalVerification) {
        return this.createError(
          'CREATE_PROFILE_PAGE_NOT_READY',
          'Create profile page elements not found after extended wait'
        );
      }
    }
    }
    
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

  private async resumeProfileCreation(options?: { uploadOnly?: boolean; skipOtp?: boolean; skipLocation?: boolean; step?: string }): Promise<AutomationResult> {
    try {
      // If specific step is requested, navigate directly to it first
      if (options?.step) {
        logger.info(`Forcing navigation to step: ${options.step}`);
        const stepUrl = `https://www.upwork.com/nx/create-profile/${options.step}`;
        
        // Navigate to the step with retries
        let navigationSuccess = false;
        let attempts = 0;
        const maxAttempts = 2;

        while (attempts < maxAttempts) {
          attempts++;
          logger.info(`Navigation attempt ${attempts}/${maxAttempts} to ${options.step} step...`);

          try {
            await this.page.goto(stepUrl, {
              waitUntil: 'networkidle2',
              timeout: 20000,
            });
            await this.randomDelay(1000, 1700);

            // Wait for URL to update
            await this.waitForPageTransition();
            
            // Verify we reached the correct step
            const currentUrl = this.page.url();
            logger.info(`Current URL after navigation: ${currentUrl}`);

            if (currentUrl.includes(`/nx/create-profile/${options.step}`)) {
              logger.info(`Successfully navigated to ${options.step} step`);
              await this.waitForPageReady();

              // Step-specific readiness checks
              if (options.step === 'welcome') {
                const getStarted = await this.waitForSelectorWithRetry([
                  'button[data-qa="get-started-btn"]',
                  '[aria-label*="Get started"]',
                  'button:contains("Get Started")',
                ], 15000);
                if (getStarted) {
                  logger.info('Welcome page verified (Get Started button present)');
                  navigationSuccess = true;
                  break;
                }
                logger.warn('Get Started button not found on welcome page, refreshing and retrying...');
                await this.page.reload({ waitUntil: 'networkidle2', timeout: 20000 });
                await this.randomDelay(1500, 2500);
                continue;
              }

              if (options.step === 'education') {
                const addButton = await this.waitForSelectorWithRetry([
                  'button[data-qa="education-add-btn"][data-ev-label="education_add_btn"]',
                  'button[data-qa="education-add-btn"]',
                  '#add-education-label',
                  '.carousel-list-add-new'
                ], 20000);
                if (addButton) {
                  logger.info('Education page verified (Add Education button present)');
                  navigationSuccess = true;
                  break;
                }
                logger.warn('Education Add button not found, refreshing and retrying...');
                await this.page.reload({ waitUntil: 'networkidle2', timeout: 20000 });
                await this.randomDelay(1500, 2500);
                continue;
              }

              // Default: consider success if URL matches and page is ready
              navigationSuccess = true;
              break;
            }

            logger.warn(`Navigation attempt ${attempts} failed, URL is ${currentUrl}`);
            await this.randomDelay(4000, 6000);
          } catch (error) {
            logger.warn(`Navigation attempt ${attempts} failed with error:`, error);
            await this.randomDelay(4000, 6000);
          }
        }

        if (!navigationSuccess) {
          return this.createError(
            'FORCED_STEP_NAVIGATION_FAILED',
            `Failed to navigate to ${options.step} step after ${maxAttempts} attempts`
          );
        }
      }
      
      const currentUrl = this.page.url();
      const currentStep = this.detectProfileStep(currentUrl);
      
      logger.info(`Resuming profile creation from step: ${currentStep}, URL: ${currentUrl}, Upload only: ${options?.uploadOnly}, Skip location: ${options?.skipLocation}, Force step: ${options?.step}`);

      // Check if we're already on the location page and skipLocation is enabled
      if (options?.skipLocation && currentStep === 'location') {
        logger.info('Skip-Location mode: already on location page, marking rate step as completed');
        await this.markRateStepCompleted();
        return this.createSuccess('done');
      }

      const steps = ['welcome', 'experience', 'goal', 'work_preference', 'resume_import', 'categories', 'skills', 'title', 'employment', 'education', 'languages', 'overview', 'rate', 'general', 'location', 'submit'];
      let currentStepIndex = this.getStepIndex(currentStep);
      
      // Execute remaining steps in order
      for (let i = currentStepIndex; i < steps.length; i++) {
        const stepName = steps[i];

        // Re-detect current path before executing each step and realign if needed
        const urlNow = this.page.url();
        const detectedNow = this.detectProfileStep(urlNow);
        
        // Enhanced step detection and routing with 3 max retries
        if (detectedNow !== stepName && detectedNow !== 'initial') {
          logger.info(`Detected current step '${detectedNow}' differs from planned '${stepName}'. Attempting to run detected step first.`);
          
          // Try to run the detected step first (up to 3 attempts)
          let detectedStepSuccess = false;
          for (let attempt = 1; attempt <= 3; attempt++) {
            logger.info(`Attempt ${attempt}/3: Running detected step '${detectedNow}' instead of planned '${stepName}'`);
            
            const detectedStepResult = await this.executeStep(detectedNow, options);
            if (detectedStepResult.status === 'success') {
              logger.info(`✅ Successfully executed detected step '${detectedNow}' on attempt ${attempt}`);
              detectedStepSuccess = true;
              break;
            } else {
              logger.warn(`❌ Failed to execute detected step '${detectedNow}' on attempt ${attempt}: ${detectedStepResult.error_code}`);
              if (attempt < 3) {
                await this.randomDelay(3000, 5000);
              }
            }
          }
          
          if (!detectedStepSuccess) {
            logger.error(`Failed to execute detected step '${detectedNow}' after 3 attempts. Logging failure and continuing with planned step.`);
            // Log the failure but continue with the planned step
          }
          
          // Re-detect the current step after attempting the detected step
          const newUrl = this.page.url();
          const newDetected = this.detectProfileStep(newUrl);
          logger.info(`After attempting ${detectedNow}, now on step: ${newDetected}`);
          
          // If we're now on the planned step, continue normally
          if (newDetected === stepName) {
            logger.info(`Now on planned step '${stepName}', continuing normally`);
          } else if (newDetected !== 'initial' && newDetected !== 'unknown') {
            // If we're on a different step, realign
            logger.info(`Realigning to new detected step '${newDetected}'`);
            i = this.getStepIndex(newDetected) - 1; // -1 because for-loop will ++i
            continue;
          }
        }
        
        // Execute the current step
        const stepResult = await this.executeStep(stepName, options);
        
        // Check if step failed
        if (stepResult.status !== 'success') {
          return stepResult;
        }
        
        // Check if the step handler detected a redirect to a later step
        // If so, we should skip the remaining steps and handle the redirect properly
        const currentUrlAfterStep = this.page.url();
        const detectedStepAfter = this.detectProfileStep(currentUrlAfterStep);
        
        // If we're now on a step that comes after the current step in the sequence, 
        // it means we were redirected and should handle it appropriately
        if (detectedStepAfter !== stepName && detectedStepAfter !== 'initial' && detectedStepAfter !== 'unknown') {
          const currentStepIndex = this.getStepIndex(stepName);
          const detectedStepIndex = this.getStepIndex(detectedStepAfter);
          
          if (detectedStepIndex > currentStepIndex) {
            logger.info(`Step ${stepName} redirected to later step ${detectedStepAfter}, handling redirect...`);
            
            // If we're redirected to location step, run the location handler
            if (detectedStepAfter === 'location') {
              logger.info('✅ Redirected to location step, running location handler...');
              const locationResult = await this.executeStep('location', options);
              if (locationResult.status === 'success') {
                logger.info('✅ Location step completed successfully');
                return this.createSuccess('done');
              } else {
                logger.error(`❌ Location step failed: ${locationResult.error_code}`);
                return locationResult;
              }
            }
            
            // If we're redirected to submit step, handle it specially
            if (detectedStepAfter === 'submit') {
              logger.info('✅ Redirected to submit step, running submit handler...');
              const submitResult = await this.executeStep('submit', options);
              if (submitResult.status === 'success') {
                logger.info('✅ Submit step completed successfully');
                return this.createSuccess('done');
              } else {
                logger.error(`❌ Submit step failed: ${submitResult.error_code}`);
                return submitResult;
              }
            }
            
            // For other redirects, realign to the detected step
            logger.info(`Realigning to detected step ${detectedStepAfter} after redirect from ${stepName}`);
            i = detectedStepIndex - 1; // -1 because for-loop will ++i
            continue;
          }
        }
        
        // Special handling for location step completion
        if (stepName === 'location') {
          logger.info('Location step completed successfully, checking current page...');
          
          // Wait a bit for any redirects to complete
          await this.randomDelay(3000, 5000);
          
          // Check current URL after location step completion
          const currentUrl = this.page.url();
          const detectedStep = this.detectProfileStep(currentUrl);
          
          if (currentUrl.includes('/nx/create-profile/location')) {
            logger.info('✅ Successfully reached location page, waiting 10 seconds...');
            await this.randomDelay(10000, 10000); // Wait exactly 10 seconds
            logger.info('✅ Automation completed successfully - reached location page and waited 10 seconds');
            return this.createSuccess('done');
          } else if (currentUrl.includes('/nx/create-profile/submit')) {
            logger.info('✅ Location step completed and redirected to submit page - running submit handler');
            // Run the submit step handler
            const submitResult = await this.executeStep('submit', options);
            if (submitResult.status === 'success') {
              logger.info('✅ Submit step completed successfully');
              return this.createSuccess('done');
            } else {
              logger.error(`❌ Submit step failed: ${submitResult.error_code}`);
              return submitResult;
            }
          } else if (currentUrl.includes('/profile') || currentUrl.includes('/dashboard') || currentUrl.includes('/welcome')) {
            logger.info('✅ Location step completed and redirected to completion page - automation successful');
            return this.createSuccess('done');
          } else {
            logger.warn(`Location step completed but redirected to unexpected page: ${currentUrl} (detected step: ${detectedStep})`);
            
            // If we detected a valid step, try to run it
            if (detectedStep !== 'unknown' && detectedStep !== 'initial') {
              logger.info(`Attempting to run detected step: ${detectedStep}`);
              const detectedStepResult = await this.executeStep(detectedStep, options);
              if (detectedStepResult.status === 'success') {
                logger.info(`✅ Successfully completed detected step: ${detectedStep}`);
                return this.createSuccess('done');
              } else {
                logger.error(`❌ Detected step ${detectedStep} failed: ${detectedStepResult.error_code}`);
                return detectedStepResult;
              }
            }
            
            return this.createError('LOCATION_PAGE_NOT_REACHED', `Location step completed but redirected to unexpected page: ${currentUrl}`);
          }
        }
        
        // Verify URL changed after step completion (except for submit step)
        if (stepName !== 'submit') {
          await this.randomDelay(2000, 3000); // Wait for potential navigation
          const currentUrl = this.page.url();
          const currentStep = this.detectProfileStep(currentUrl);
          
          // If we're still on the same step, the step failed to progress
          if (currentStep === stepName) {
            logger.error(`Step ${stepName} appears to be stuck - URL did not change after completion`);
            logger.error(`Current URL: ${currentUrl}, Expected to move from ${stepName}`);
            return this.createError(
              `${stepName.toUpperCase()}_STEP_STUCK`,
              `Step ${stepName} failed to progress - still on same URL: ${currentUrl}`
            );
          } else {
            logger.info(`✅ Step ${stepName} completed successfully - moved from ${stepName} to ${currentStep}`);
          }
        }
        
        // Special case: if skipLocation is enabled and we just completed the rate step,
        // check if we're now on the location page and stop there
        if (stepName === 'rate' && options?.skipLocation) {
          logger.info('Skip-Location mode: completed rate step, checking if we\'re on location page...');
          await this.randomDelay(2000, 3000); // Wait for potential redirect
          
          const currentUrl = this.page.url();
          const newStep = this.detectProfileStep(currentUrl);
          
          if (newStep === 'location' || currentUrl.includes('/nx/create-profile/location')) {
            logger.info('Skip-Location mode: redirected to location page after rate step, marking as completed');
            await this.markRateStepCompleted();
            return this.createSuccess('rate_completed');
          }
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
            await this.randomDelay(3000, 4000);
            
            // Verify we actually reached the submit page
            const currentUrl = this.page.url();
            logger.info(`Current URL after redirect attempt: ${currentUrl}`);
            
            if (currentUrl.includes('/nx/create-profile/submit')) {
              logger.info('✅ Successfully redirected to submit page - running submit handler');
              // Run the submit step handler
              const submitResult = await this.executeStep('submit', options);
              if (submitResult.status === 'success') {
                logger.info('✅ Submit step completed successfully');
                return this.createSuccess('done');
              } else {
                logger.error(`❌ Submit step failed: ${submitResult.error_code}`);
                return submitResult;
              }
            } else if (currentUrl.includes('/nx/create-profile/location')) {
              logger.error('❌ Redirect failed: still on location page, profile creation may be incomplete');
              return this.createError('SUBMIT_REDIRECT_FAILED', `Redirect to submit page failed - still on location page: ${currentUrl}`);
            } else {
              logger.warn(`⚠️ Redirected to unexpected page: ${currentUrl}`);
              // Check if we're on a completion/success page
              if (currentUrl.includes('/profile') || currentUrl.includes('/dashboard') || currentUrl.includes('/welcome')) {
                logger.info('Appears to be on a completion page, considering successful');
                return this.createSuccess('done');
              } else {
                return this.createError('SUBMIT_REDIRECT_UNEXPECTED', `Redirected to unexpected page: ${currentUrl}`);
              }
            }
          } catch (error) {
            logger.error('Failed to redirect to submit page:', error);
            return this.createError('SUBMIT_REDIRECT_FAILED', `Failed to redirect to submit page: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
        
        // Special case: if we just completed the submit step, we're done
        if (stepName === 'submit') {
          logger.info('✅ Submit step completed, profile creation finished');
          return this.createSuccess('done');
        }
        


      }
      
      // If we completed all steps but didn't reach location, something went wrong
      logger.warn('Completed all steps but did not reach location step - this should not happen');
      return this.createError('LOCATION_STEP_NOT_COMPLETED', 'All steps completed but location step was not processed');
      
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
    if (url.includes('/general')) return 'general';
    if (url.includes('/submit')) return 'submit';
    return 'initial';
  }

  private getStepIndex(stepName: string): number {
    const steps = ['welcome', 'experience', 'goal', 'work_preference', 'resume_import', 'categories', 'skills', 'title', 'employment', 'education', 'languages', 'overview', 'rate', 'general', 'location', 'submit'];
    const index = steps.indexOf(stepName);
    return index === -1 ? 0 : index;
  }

  private async executeStep(stepName: string, options?: any): Promise<AutomationResult> {
    logger.info(`Executing step: ${stepName}`);
    
    // Use step handler if available, otherwise use legacy method
    if (this.stepHandlers.has(stepName)) {
      logger.info(`Using step handler for: ${stepName}`);
      const handler = this.stepHandlers.get(stepName);
      // Pass options to step handler
      return await handler.execute(options);
    } else {
      logger.warn(`No step handler found for: ${stepName}, using legacy handling`);
      // Fallback to legacy step handling
      return await this.handleLegacyStep(stepName);
    }
  }

  private async handleLegacyStep(stepName: string): Promise<AutomationResult> {
    // Placeholder for legacy step handling
    // This would contain the original step logic for steps not yet refactored
    logger.warn(`Using legacy handling for step: ${stepName}`);
    
    // Special handling for welcome step
    if (stepName === 'welcome') {
      const url = this.page.url();
      // If we are no longer on welcome, skip gracefully
      if (!url.includes('/nx/create-profile/welcome')) {
        logger.info('Skipping welcome step because current path is beyond welcome');
        return this.createSuccess('welcome_skipped');
      }
      return await this.handleWelcomeStep();
    }
    

    
    // Special handling for employment step
    if (stepName === 'employment') {
      return await this.handleEmploymentStep();
    }
    
    // Special handling for rate step
    if (stepName === 'rate') {
      return await this.handleRateStep();
    }
    
    // For now, just try to click next button
    const result = await this.navigationAutomation.clickNextButton(stepName);
    
    // For legacy steps, also verify URL change
    if (result.status === 'success') {
      await this.randomDelay(2000, 3000); // Wait for potential navigation
      const currentUrl = this.page.url();
      const currentStep = this.detectProfileStep(currentUrl);
      
      // If we're still on the same step, the step failed to progress
      if (currentStep === stepName) {
        logger.error(`Legacy step ${stepName} appears to be stuck - URL did not change after Next button click`);
        logger.error(`Current URL: ${currentUrl}, Expected to move from ${stepName}`);
        return this.createError(
          `${stepName.toUpperCase()}_LEGACY_STEP_STUCK`,
          `Legacy step ${stepName} failed to progress - still on same URL: ${currentUrl}`
        );
      } else {
        logger.info(`✅ Legacy step ${stepName} completed successfully - moved from ${stepName} to ${currentStep}`);
      }
    }
    
    return result;
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



  private async handleEmploymentStep(): Promise<AutomationResult> {
    logger.info('Handling employment step...');
    
    try {
      await this.waitForPageReady();
      await this.randomDelay(2000, 3000); // Extra wait for page to fully load
      
      // Check multiple times for the warning message (it might appear after a delay)
      let warningMessage = null;
      let warningText = '';
      
      for (let attempt = 1; attempt <= 3; attempt++) {
        logger.info(`Checking for employment warning (attempt ${attempt}/3)...`);
        
        warningMessage = await this.page.$('[data-qa="invalid-item-message"]');
        if (warningMessage) {
          warningText = await warningMessage.evaluate((el: Element) => el.textContent?.trim() || '');
          logger.warn(`Employment warning detected: ${warningText}`);
          break;
        }
        
        if (attempt < 3) {
          await this.randomDelay(2000, 3000);
        }
      }
      
      if (warningMessage && warningText.includes('missing anything')) {
        logger.info('Detected incomplete employment information, looking for edit button...');
        
        // Look for the edit button with multiple attempts
        let editButton = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          logger.info(`Looking for edit button (attempt ${attempt}/3)...`);
          
          editButton = await this.waitForSelectorWithRetry([
            'button[data-qa="edit-item"]',
            'button[data-ev-label="edit_item"]',
            'button[aria-label="Edit"]',
            '.air3-btn-circle[aria-label="Edit"]',
            'button.air3-btn-secondary.air3-btn-circle',
            'button:contains("Edit")',
            '.air3-btn-circle:has(svg)',
            '[data-qa="edit-item"]'
          ], 5000);
          
          if (editButton) {
            logger.info('Found edit button');
            break;
          }
          
          if (attempt < 3) {
            await this.randomDelay(300, 700);
          }
        }
        
        if (editButton) {
          logger.info('Found edit button, clicking to fix employment information...');
          await this.clickElement(editButton);
          await this.randomDelay(3000, 4000); // Longer wait for modal to appear
          
          // Wait for the edit modal to appear with retry
          let modalAppeared = false;
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              await this.page.waitForSelector('[role="dialog"]', { timeout: 5000 });
              modalAppeared = true;
              logger.info('Employment edit modal appeared');
              break;
            } catch (error) {
              logger.info(`Modal appearance attempt ${attempt}/3 failed, retrying...`);
              if (attempt < 3) {
                await this.randomDelay(4000, 6000);
              }
            }
          }
          
          if (!modalAppeared) {
            logger.error('Employment edit modal did not appear after multiple attempts');
            return this.createError('EMPLOYMENT_MODAL_NOT_APPEARED', 'Employment edit modal did not appear');
          }
          
          // Handle the missing information in the modal
          const modalResult = await this.fillEmploymentModal();
          if (modalResult.status !== 'success') {
            return modalResult;
          }
          
          // After successfully filling modal, wait and try to proceed
          await this.randomDelay(3000, 4000);
          logger.info('Employment information updated, proceeding to next step...');
          
        } else {
          logger.warn('Edit button not found after multiple attempts, but warning detected');
          // Try to proceed anyway - the warning might be spurious
        }
      } else {
        logger.info('No employment warning detected or warning does not indicate missing information');
      }
      
      // If no warning or after handling it, try to proceed with next button
      logger.info('Attempting to proceed to next step from employment...');
      return await this.navigationAutomation.clickNextButton('employment');
      
    } catch (error) {
      logger.error('Error in handleEmploymentStep:', error);
      return this.createError(
        'EMPLOYMENT_STEP_FAILED',
        `Employment step failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async fillEmploymentModal(): Promise<AutomationResult> {
    logger.info('Filling employment modal with missing information...');
    
    try {
      // Wait for modal to be fully loaded
      await this.randomDelay(2000, 3000);
      logger.info('Waiting for employment modal to be fully loaded...');
      
      // Wait for modal content to be present
      await this.page.waitForSelector('[role="dialog"]', { timeout: 10000 });
      await this.randomDelay(1000, 2000);
      
      // Check and fill location if missing - try multiple selectors
      logger.info('Looking for location input field...');
      const locationInput = await this.waitForSelectorWithRetry([
        'input[aria-labelledby="location-label"]',
        'input[placeholder*="London"]',
        'input[placeholder*="Ex: London"]',
        'input[type="text"][aria-labelledby*="location"]',
        '[role="dialog"] input[type="text"]:not([aria-labelledby*="title"]):not([aria-labelledby*="company"])',
        '[role="dialog"] input[placeholder*="Location"]'
      ], 10000);
      
      if (locationInput) {
        const currentValue = await locationInput.evaluate((el: Element) => (el as HTMLInputElement).value);
        logger.info(`Location field current value: "${currentValue}"`);
        
        if (!currentValue || currentValue.trim() === '') {
          logger.info('Location field is empty, filling it with Manchester...');
          await this.clearAndType(locationInput, 'Manchester');
          await this.randomDelay(2000, 3000);
          logger.info('Location field filled successfully');
        } else {
          logger.info(`Location already filled with: ${currentValue}`);
        }
      } else {
        logger.warn('Location input field not found - continuing anyway');
      }
      
      // Check for "currently working" checkbox - be more specific
      logger.info('Looking for "currently working" checkbox...');
      
      // First try to find the checkbox by looking for the label text
      const checkboxContainer = await this.page.evaluate(() => {
        const labels = Array.from(document.querySelectorAll('label'));
        const targetLabel = labels.find(label => 
          label.textContent?.includes('I am currently working in this role')
        );
        if (targetLabel) {
          const checkbox = targetLabel.querySelector('input[type="checkbox"]');
          return {
            found: true,
            checked: checkbox ? (checkbox as HTMLInputElement).checked : false,
            labelExists: true
          };
        }
        return { found: false, checked: false, labelExists: false };
      });
      
      logger.info(`Checkbox status: found=${checkboxContainer.found}, checked=${checkboxContainer.checked}`);
      
      if (checkboxContainer.found && !checkboxContainer.checked) {
        logger.info('Checkbox is not checked, clicking to check it...');
        
        // Try multiple approaches to click the checkbox
        const checkboxClicked = await this.page.evaluate(() => {
          const labels = Array.from(document.querySelectorAll('label'));
          const targetLabel = labels.find(label => 
            label.textContent?.includes('I am currently working in this role')
          );
          if (targetLabel) {
            targetLabel.click();
            return true;
          }
          return false;
        });
        
        if (checkboxClicked) {
          await this.randomDelay(1500, 2500);
          logger.info('Checkbox clicked successfully');
        } else {
          logger.warn('Failed to click checkbox - continuing anyway');
        }
      } else if (checkboxContainer.checked) {
        logger.info('Checkbox is already checked');
      } else {
        logger.warn('Checkbox not found - continuing anyway');
      }
      
      // Extra wait before saving
      await this.randomDelay(2000, 3000);
      
      // Look for and click the Save button with more robust selectors
      logger.info('Looking for Save button...');
      const saveButton = await this.waitForSelectorWithRetry([
        'button[class*="btn-primary"]:contains("Save")',
        'button:contains("Save")',
        '[role="dialog"] button:contains("Save")',
        'button[data-qa="btn-save"]',
        '.air3-btn-primary:contains("Save")',
        '[role="button"]:contains("Save")',
        'button[type="submit"]'
      ], 10000);
      
      if (saveButton) {
        logger.info('Found Save button, clicking it...');
        await this.clickElement(saveButton);
        await this.randomDelay(3000, 4000); // Longer wait for save processing
        
        // Wait for modal to close with more robust checking
        logger.info('Waiting for modal to close...');
        let modalClosed = false;
        
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await this.page.waitForSelector('[role="dialog"]', { timeout: 3000, hidden: true });
            modalClosed = true;
            logger.info('Modal closed successfully');
            break;
          } catch (error) {
            logger.info(`Modal close attempt ${attempt}/3 timed out, checking if modal still exists...`);
            
            const modalStillExists = await this.page.$('[role="dialog"]');
            if (!modalStillExists) {
              modalClosed = true;
              logger.info('Modal is no longer present, considering it closed');
              break;
            }
            
            if (attempt < 3) {
              await this.randomDelay(4000, 6000);
            }
          }
        }
        
        if (!modalClosed) {
          logger.warn('Modal may still be open, but continuing...');
        }
        
        // Extra wait after modal close
        await this.randomDelay(2000, 3000);
        logger.info('Employment modal processing completed');
        
        return this.createSuccess();
      } else {
        logger.error('Save button not found in employment modal');
        return this.createError(
          'EMPLOYMENT_SAVE_BUTTON_NOT_FOUND',
          'Save button not found in employment modal after extended wait'
        );
      }
      
    } catch (error) {
      logger.error('Error in fillEmploymentModal:', error);
      return this.createError(
        'EMPLOYMENT_MODAL_FILL_FAILED',
        `Failed to fill employment modal: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async handleRateStep(): Promise<AutomationResult> {
    logger.info('Handling rate step...');
    
    try {
      await this.waitForPageReady();
      await this.randomDelay(2000, 3000);
      
      // Generate random hourly rate between $10-$20
      const minRate = 10;
      const maxRate = 20;
      const randomRate = Math.floor(Math.random() * (maxRate - minRate + 1)) + minRate;
      const rateValue = `${randomRate}.00`;
      
      logger.info(`Setting hourly rate to $${rateValue}`);
      
      // Look for the currency input field
      const currencyInput = await this.waitForSelectorWithRetry([
        'input[data-test="currency-input"]',
        'input[data-ev-label="currency_input"]',
        'input[placeholder="$0.00"]',
        'input[aria-describedby*="currency-hourly"]',
        'input[data-ev-currency="USD"]',
        'input[type="text"][placeholder*="$"]',
        '.air3-input[placeholder*="$"]'
      ], 10000);
      
      if (!currencyInput) {
        logger.error('Currency input field not found on rate page');
        return this.createError('RATE_INPUT_NOT_FOUND', 'Currency input field not found on rate page');
      }
      
      // Clear and enter the rate
      logger.info(`Entering rate: $${rateValue}`);
      await this.clearAndType(currencyInput, rateValue);
      await this.randomDelay(2000, 3000);
      
      // Verify the rate was entered correctly
      const enteredValue = await currencyInput.evaluate((el: Element) => (el as HTMLInputElement).value);
      logger.info(`Rate entered: ${enteredValue}`);
      
      if (enteredValue.includes(rateValue) || enteredValue.includes(randomRate.toString())) {
        logger.info('✅ Rate entered successfully');
      } else {
        logger.warn(`⚠️ Rate verification unclear. Expected: ${rateValue}, Got: ${enteredValue}`);
      }
      
      // Wait a bit for any validation
      await this.randomDelay(2000, 3000);
      
      // Try to proceed to next step
      logger.info('Attempting to proceed from rate step...');
      return await this.navigationAutomation.clickNextButton('rate');
      
    } catch (error) {
      logger.error('Error in handleRateStep:', error);
        return this.createError(
        'RATE_STEP_FAILED',
        `Rate step failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
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
        await this.randomDelay(300, 700);
        
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
            await this.randomDelay(4000, 6000);
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
              await this.randomDelay(4000, 6000);
            }
          }
        } catch (tabError) {
          logger.warn(`Tab+enter method failed: ${tabError instanceof Error ? tabError.message : 'Unknown error'}`);
          if (attempts < maxAttempts) {
            await this.randomDelay(4000, 6000);
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
        await this.randomDelay(300, 700);
        
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
        await this.randomDelay(1000, 1700);
        
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
            await this.randomDelay(1000, 1700);
            
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
      
      // Get real OTP from SMSPool service (primary) or SMS-Man (backup)
      let otpCode: string;
      try {
        // Try SMSPool first
        const { SmsPoolService } = await import('../services/smspoolService.js');
        const smsPoolService = new SmsPoolService();
        logger.info('Waiting for OTP from SMSPool service...');
        
        // Wait for OTP with 3 minute timeout
        const receivedOtp = await smsPoolService.waitForOTP(this.user.id, this.user.country_code, 360);
        
        if (!receivedOtp) {
          logger.error('No OTP received from SMSPool within 180 seconds');
          return this.createError('OTP_NOT_RECEIVED', 'No OTP received from SMSPool within 180 seconds');
        }
        
        otpCode = receivedOtp;
        logger.info(`✅ Received OTP from SMSPool: ${otpCode}`);
        
      } catch (error) {
        logger.error('Failed to get OTP from SMSPool:', error);
        
        // Try SMS-Man as fallback
        logger.warn('SMSPool failed, trying SMS-Man as fallback...');
        try {
          const { SmsManService } = await import('../services/smsManService.js');
          const smsManService = new SmsManService();
          const receivedOtp = await smsManService.waitForOTP(this.user.id, this.user.country_code, 360);
          
          if (receivedOtp) {
            otpCode = receivedOtp;
            logger.info(`✅ Received OTP from SMS-Man: ${otpCode}`);
          } else {
            logger.error('No OTP received from SMS-Man within 180 seconds');
            return this.createError('OTP_NOT_RECEIVED', 'No OTP received from SMS-Man within 180 seconds');
          }
        } catch (smsManError) {
          logger.error('SMS-Man also failed:', smsManError);
          // Fallback to test code if both providers fail
          logger.warn('Falling back to test OTP code 12345 due to provider errors');
          otpCode = '12345';
        }
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

  private async markRateStepCompleted(): Promise<void> {
    try {
      logger.info('Marking rate step as completed...');
      
      const db = await import('../database/connection.js').then(m => m.getDatabase());
      await db
        .updateTable('users')
        .set({ rate_step_completed_at: new Date() })
        .where('id', '=', this.user.id)
        .execute();
      
      logger.info(`✅ Rate step marked as completed for user ${this.user.id}`);
    } catch (error) {
      logger.error('Failed to mark rate step as completed:', error);
      throw error;
    }
  }
}
