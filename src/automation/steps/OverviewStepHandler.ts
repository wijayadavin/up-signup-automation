import { StepHandler } from '../StepHandler';
import { AutomationResult } from '../BaseAutomation';

// Create a simple logger for automation
const logger = {
  info: (message: string, ...args: any[]) => console.log(`[INFO] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[WARN] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[ERROR] ${message}`, ...args),
  debug: (message: string, ...args: any[]) => console.debug(`[DEBUG] ${message}`, ...args),
};

export class OverviewStepHandler extends StepHandler {
  constructor(page: any, user: any) {
    super(page, user, 'overview');
  }

  async execute(): Promise<AutomationResult> {
    return await this.executeStepPattern(
      '/nx/create-profile/overview',
      () => this.fillOverviewForm()
    );
  }

  private async fillOverviewForm(): Promise<AutomationResult> {
    logger.info('Filling overview form...');

    // Lorem ipsum text with at least 100 characters
    const overviewText = `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.`;

    return await this.formAutomation.fillTextarea([
      'textarea[aria-labelledby="overview-label"]',
      'textarea[aria-describedby="overview-counter"]',
      'textarea.air3-textarea',
      'textarea[placeholder*="Enter your top skills"]',
      'textarea',
    ], overviewText, 'overview');
  }
}
