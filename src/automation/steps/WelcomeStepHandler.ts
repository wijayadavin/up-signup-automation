import { StepHandler } from '../StepHandler.js';
import { AutomationResult } from '../BaseAutomation.js';

const logger = {
  info: (message: string, ...args: any[]) => console.log(`[INFO] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[WARN] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[ERROR] ${message}`, ...args),
  debug: (message: string, ...args: any[]) => console.log(`[DEBUG] ${message}`, ...args),
};

export class WelcomeStepHandler extends StepHandler {
  constructor(page: any, user: any) {
    super(page, user, 'welcome');
  }

  async execute(options?: { uploadOnly?: boolean; skipOtp?: boolean; skipLocation?: boolean }): Promise<AutomationResult> {
    try {
      logger.info('Handling welcome step...');

      // Assert current route
      const currentUrl = this.page.url();
      if (!currentUrl.includes('/nx/create-profile')) {
        return this.createError(
          'NOT_ON_CREATE_PROFILE',
          `Expected create profile page, got ${currentUrl}`
        );
      }

      // Take screenshot of create profile page
      this.screenshots.create_profile = await this.takeScreenshot('create_profile');

      // Detect current profile creation step
      const profileStep = this.detectProfileStep(currentUrl);
      logger.info(`Detected profile creation step: ${profileStep}`);

      // Handle different starting points
      if (profileStep === 'initial' || profileStep === 'welcome') {
        // On initial create-profile or explicit welcome page - click Get Started
        const getStartedButton = await this.waitForSelectorWithRetry([
          'button[data-qa="get-started-btn"]',
          '[aria-label*="Get started"]',
          'button:contains("Get Started")',
        ], 15000);

        if (!getStartedButton) {
          return this.createError(
            'GET_STARTED_NOT_FOUND',
            'Get Started button not found on welcome page'
          );
        }

        await getStartedButton.click();
        await this.randomDelay(700, 1000);

        // Wait for navigation
        try {
          await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
        } catch (error) {
          return this.createError(
            'NAVIGATION_TIMEOUT',
            'Navigation timeout after clicking Get Started'
          );
        }
      } else {
        logger.info(`Skipping welcome step because current path is beyond welcome (${profileStep})`);
      }

      logger.info('Welcome step completed successfully');
      return this.createSuccess();

    } catch (error) {
      return this.createError(
        'WELCOME_STEP_FAILED',
        `Welcome step failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Helper method to detect profile step from URL
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
    if (url.includes('/submit')) return 'submit';
    
    // If we're on the create-profile page but not on a specific step, we're at the initial page
    if (url.includes('/nx/create-profile')) return 'initial';
    
    return 'unknown';
  }
}
