import { StepHandler } from '../StepHandler';
import { AutomationResult } from '../BaseAutomation';

export class EducationStepHandler extends StepHandler {
  constructor(page: any, user: any) {
    super(page, user, 'education');
  }

  async execute(): Promise<AutomationResult> {
    // Education is typically auto-filled from resume upload, so just try Next button
    return await this.executeSimpleStep('/nx/create-profile/education');
  }
}
