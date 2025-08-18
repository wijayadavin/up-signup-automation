import { StepHandler } from '../StepHandler';
import { AutomationResult } from '../BaseAutomation';

// Create a simple logger for automation
const logger = {
  info: (message: string, ...args: any[]) => console.log(`[INFO] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[WARN] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[ERROR] ${message}`, ...args),
  debug: (message: string, ...args: any[]) => console.debug(`[DEBUG] ${message}`, ...args),
};

export class SkillsStepHandler extends StepHandler {
  constructor(page: any, user: any) {
    super(page, user, 'skills');
  }

  async execute(options?: { uploadOnly?: boolean; skipOtp?: boolean; skipLocation?: boolean }): Promise<AutomationResult> {
    try {
      logger.info('Handling skills step...');

      // Validate current page
      const pageValidation = await this.validateCurrentPage('/nx/create-profile/skills');
      if (pageValidation) {
        return pageValidation;
      }

      await this.waitForPageReady();
      this.screenshots.skills_before = await this.takeScreenshot('skills_before');

      // Check if there's an error message indicating skills are required
      const errorMessage = await this.page.$('text="At least one skill is required."');
      const hasError = errorMessage !== null;

      // If there's an error or no skills are selected, we need to fill the form
      if (hasError) {
        logger.info('Skills error detected, filling skills form...');
        return await this.fillSkillsForm();
      }

      // Check if any skills are already selected
      const selectedSkills = await this.page.$$('.air3-token.air3-token-selected, .air3-token[aria-selected="true"]');
      if (selectedSkills.length === 0) {
        logger.info('No skills selected, filling skills form...');
        return await this.fillSkillsForm();
      }

      // If skills are already selected, try to find and click Next button
      logger.info(`${selectedSkills.length} skills already selected, looking for Next button...`);
      const result = await this.navigationAutomation.clickNextButton(this.stepName);
      this.screenshots.skills_after = await this.takeScreenshot('skills_after');
      return result;

    } catch (error) {
      return this.createError(
        'SKILLS_STEP_FAILED',
        `Skills step failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async fillSkillsForm(): Promise<AutomationResult> {
    try {
      logger.info('Filling skills form...');

      // Suggested skills to click
      const suggestedSkills = [
        'Coaching',
        'Business Coaching', 
        'Career Coaching',
        'Continuing Professional Development',
        'Professional Tone',
        'Life Coaching'
      ];

      // Click on the first few suggested skills
      for (let i = 0; i < Math.min(3, suggestedSkills.length); i++) {
        const skillName = suggestedSkills[i];
        logger.info(`Clicking suggested skill: ${skillName}`);
        
        const skillButton = await this.waitForSelectorWithRetry([
          `[role="button"][aria-label="${skillName}"]`,
          `.air3-token:contains("${skillName}")`,
          `div[aria-label="${skillName}"]`,
        ], 5000);

        if (skillButton) {
          await this.clickElement(skillButton);
          logger.info(`Successfully clicked skill: ${skillName}`);
        } else {
          logger.warn(`Could not find skill button for: ${skillName}`);
        }
      }

      // Wait a moment for the skills to be processed
      await this.randomDelay(1000, 2000);

      // Check if the error message is gone
      const errorMessage = await this.page.$('text="At least one skill is required."');
      if (errorMessage) {
        logger.warn('Error message still present after selecting skills');
      } else {
        logger.info('Error message cleared, skills selected successfully');
      }

      // Now try to find and click Next button
      logger.info('Attempting to click Next button after skills selection...');
      const result = await this.navigationAutomation.clickNextButton(this.stepName);
      
      logger.info(`Next button click result: ${result.status} - ${result.error_code || 'success'}`);
      
      if (result.status === 'success') {
        logger.info('Skills form filled and navigation completed successfully');
        this.screenshots.skills_after = await this.takeScreenshot('skills_after');
        return result;
      } else {
        logger.warn(`Skills navigation failed: ${result.error_code} - ${result.evidence}`);
        
        // Fallback: try to find and click Next button manually
        logger.info('Attempting fallback Next button click...');
        const fallbackResult = await this.tryFallbackNextButton();
        
        this.screenshots.skills_after = await this.takeScreenshot('skills_after');
        return fallbackResult;
      }

    } catch (error) {
      return this.createError(
        'SKILLS_FORM_FILL_FAILED',
        `Failed to fill skills form: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async tryFallbackNextButton(): Promise<AutomationResult> {
    try {
      logger.info('Trying fallback Next button detection...');
      
      // Try multiple approaches to find the Next button
      const nextButtonSelectors = [
        'button[data-qa="next-btn"]',
        'button[data-ev-label="next_btn"]',
        'button.air3-btn-primary:contains("Next")',
        'button:contains("Next")',
        '[role="button"]:contains("Next")',
        'button:contains("Continue")',
        'button:contains("Skip")',
        'button[type="submit"]',
        '.air3-btn-primary',
        'button.air3-btn'
      ];

      for (const selector of nextButtonSelectors) {
        try {
          logger.info(`Trying selector: ${selector}`);
          const button = await this.page.$(selector);
          
          if (button) {
            const buttonText = await button.evaluate((el: Element) => el.textContent?.trim() || '');
            const isVisible = await button.evaluate((el: Element) => {
              const rect = el.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== 'hidden';
            });
            
            logger.info(`Found button with text: "${buttonText}", visible: ${isVisible}`);
            
            if (isVisible && (buttonText.toLowerCase().includes('next') || buttonText.toLowerCase().includes('continue') || buttonText.toLowerCase().includes('skip'))) {
              logger.info(`Clicking fallback button: "${buttonText}"`);
              await this.clickElement(button);
              await this.randomDelay(2000, 3000);
              
              // Check if navigation occurred
              const newUrl = this.page.url();
              logger.info(`URL after fallback click: ${newUrl}`);
              
              if (newUrl.includes('/nx/create-profile/')) {
                logger.info('Fallback Next button click successful');
                return this.createSuccess();
              }
            }
          }
        } catch (error) {
          logger.warn(`Selector ${selector} failed: ${error}`);
          continue;
        }
      }
      
      logger.warn('All fallback Next button attempts failed');
      return this.createError(
        'SKILLS_FALLBACK_NEXT_FAILED',
        'All fallback Next button attempts failed'
      );
      
    } catch (error) {
      return this.createError(
        'SKILLS_FALLBACK_NEXT_FAILED',
        `Fallback Next button failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
