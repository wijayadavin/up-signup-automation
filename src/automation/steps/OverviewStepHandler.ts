import { StepHandler } from '../StepHandler.js';
import { AutomationResult } from '../BaseAutomation.js';

const logger = {
  info: (message: string, ...args: any[]) => console.log(`[INFO] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[WARN] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[ERROR] ${message}`, ...args),
  debug: (message: string, ...args: any[]) => console.log(`[DEBUG] ${message}`, ...args),
};

export class OverviewStepHandler extends StepHandler {
  constructor(page: any, user: any) {
    super(page, user, 'overview');
  }

  async execute(options?: { uploadOnly?: boolean; skipOtp?: boolean; skipLocation?: boolean }): Promise<AutomationResult> {
    try {
      logger.info('Handling overview step...');

      // Assert current route
      const currentUrl = this.page.url();
      if (!currentUrl.includes('/nx/create-profile/overview')) {
        return this.createError(
          'OVERVIEW_PAGE_NOT_FOUND',
          `Expected overview page, got ${currentUrl}`
        );
      }

      await this.waitForPageReady();
      this.screenshots.overview_before = await this.takeScreenshot('overview_before');

      // Find the overview textarea
      const overviewTextarea = await this.waitForSelectorWithRetry([
        'textarea[aria-labelledby="overview-label"]',
        'textarea[aria-describedby="overview-counter"]',
        'textarea.air3-textarea',
        'textarea[placeholder*="Enter your top skills"]',
        'textarea',
      ], 15000);

      if (!overviewTextarea) {
        return this.createError(
          'OVERVIEW_TEXTAREA_NOT_FOUND',
          'Overview textarea not found'
        );
      }

      // Professional overview variants for web development
      const variants = [
        "I'm a software engineer with strong experience creating professional websites for businesses of all sizes. Whether you need a polished company site, an e-commerce solution, or a portfolio to showcase your work, I can deliver. Skilled in HTML, CSS3, JavaScript, PHP, WordPress, and SEO. I manage the entire project lifecycle and ensure consistent updates, so communication stays clear at every step.",
        
        "As a web developer, I specialize in designing and coding responsive websites that help small and medium businesses grow online. From service listings to modern online stores, I create solutions tailored to your needs. My toolkit includes HTML5, CSS3, PHP, jQuery, WordPress, and SEO optimization. I provide full project oversight and prioritize transparent, regular communication with clients.",
        
        "I build clean, functional, and visually appealing websites for small and mid-sized companies. Whether it's promoting your services or selling products online, I provide custom solutions. Proficient in HTML, CSS3, PHP, WordPress, jQuery, and SEO strategies. I take care of everything from planning to deployment, with ongoing communication to keep you fully involved.",
        
        "I'm a developer who enjoys helping businesses establish and grow their online presence. From showcasing services to building e-commerce platforms, I create sites that work. Skilled in HTML, CSS3, PHP, jQuery, WordPress, and SEO optimization. I handle all project phases end-to-end and value consistent communication to make sure expectations are met.",
        
        "I create responsive, user-friendly websites for businesses that want to stand out. Whether you're aiming to showcase your portfolio, advertise services, or launch an online shop, I'll help you achieve it. Experienced in HTML, CSS3, PHP, jQuery, WordPress, and SEO. I guide projects from start to completion while maintaining frequent updates with clients.",
        
        "I'm a professional web developer focused on helping businesses build their digital identity. From corporate sites to online stores, I craft modern solutions tailored to your goals. Expertise in HTML, CSS3, PHP, WordPress, SEO, and jQuery. I oversee the full project timeline and believe clear, ongoing communication is key to success.",
        
        "My passion is building websites that help companies grow. If you need a business site, a personal portfolio, or an e-commerce store, I can deliver effective results. Knowledgeable in HTML, CSS3, PHP, WordPress, jQuery, and SEO. I manage the project workflow from planning through delivery, keeping communication frequent and reliable.",
        
        "I develop modern websites for startups and established businesses. Whether it's showcasing your work or building a custom online store, I provide solutions that work. Skilled in HTML, CSS3, PHP, WordPress, jQuery, and SEO techniques. I handle projects from start to finish, with a focus on clear updates and open communication.",
        
        "I build effective websites that help businesses connect with customers. From simple service pages to advanced online shops, I create tailored solutions. Experienced in HTML, CSS3, PHP, WordPress, jQuery, and SEO. I handle full project management and value frequent, transparent communication throughout the process.",
        
        "As a web developer, I help companies bring their ideas online. Whether you need to promote services or build a new e-commerce system, I can deliver. Skilled in HTML, CSS3, PHP, jQuery, WordPress, and SEO. I provide end-to-end project management, ensuring consistent updates and open communication at all times.",
        
        "I specialize in designing and developing websites that boost business visibility. From service pages to e-commerce stores, I offer solutions that meet your needs. Proficient in HTML, CSS3, PHP, WordPress, jQuery, and SEO practices. I manage projects completely from start to finish while keeping communication a top priority.",
        
        "I'm a web developer passionate about creating impactful websites. Whether you need a business site, service listings, or an online shop, I can help. Skilled in HTML, CSS3, PHP, WordPress, SEO, and jQuery. I guide projects through every stage, keeping clients regularly informed to ensure alignment and success.",
        
        "I deliver modern, responsive websites for businesses and entrepreneurs. From showcasing services to selling products online, I build effective solutions. My skills include HTML, CSS3, PHP, WordPress, jQuery, and SEO. I manage full project lifecycles and prioritize clear, ongoing communication with clients.",
        
        "I enjoy working with businesses to create functional and attractive websites. Whether you want to highlight your services or set up an online store, I'll provide a solution. Skilled in HTML, CSS3, PHP, WordPress, jQuery, and SEO. I manage projects end-to-end and maintain frequent communication for smooth delivery.",
        
        "I'm a website developer experienced in helping businesses expand their online presence. From small company sites to larger e-commerce stores, I build with your goals in mind. Skilled in HTML, CSS3, PHP, WordPress, jQuery, and SEO optimization. I provide full project oversight and emphasize open communication throughout.",
        
        "I create customized websites that help businesses succeed online. Whether your goal is to showcase services or build an online shop, I can support your vision. Proficient in HTML, CSS3, PHP, WordPress, jQuery, and SEO. I oversee projects from beginning to end and ensure steady, clear communication with clients.",
        
        "As a web developer, I focus on building reliable, professional websites that deliver results. From service listings to full e-commerce sites, I design and implement effective solutions. Knowledgeable in HTML, CSS3, PHP, WordPress, jQuery, and SEO. I manage the full project process and maintain consistent communication throughout.",
        
        "I build fast, responsive, and optimized websites for businesses. Whether you want to showcase your services, attract new clients, or sell products online, I've got you covered. My skills include HTML, CSS3, PHP, WordPress, jQuery, and SEO. I handle every stage of the project and provide regular updates to keep you informed.",
        
        "I specialize in developing websites that align with business goals. From professional service sites to scalable online stores, I create solutions that work. Experienced in HTML, CSS3, PHP, WordPress, jQuery, and SEO. I handle complete project management and value strong, ongoing communication with clients.",
        
        "I'm a web developer who helps businesses make a strong impression online. Whether you want a polished business site or a new e-commerce platform, I can help. Skilled in HTML, CSS3, PHP, WordPress, jQuery, and SEO strategies. I manage projects from start to completion and maintain clear, regular communication to ensure success."
      ];

      // Randomly select one of the professional overview texts
      const randomIndex = Math.floor(Math.random() * variants.length);
      const overviewText = variants[randomIndex];

      // Clear and paste the overview text
      await this.clearAndPaste(overviewTextarea, overviewText);

      logger.info(`Filled overview textarea with professional variant (index: ${randomIndex})`);

      // Look for "Next" or "Continue" button
      const nextButton = await this.waitForSelectorWithRetry([
        '[role="button"][aria-label*="Next"]',
        '[role="button"][aria-label*="Continue"]',
        '[data-test="next-button"]',
        'button:contains("Next")',
        'button:contains("Continue")',
      ], 15000);

      if (!nextButton) {
        return this.createError(
          'OVERVIEW_NEXT_NOT_FOUND',
          'Next button not found on overview page'
        );
      }

      this.screenshots.overview_after = await this.takeScreenshot('overview_after');
      await nextButton.click();
      await this.randomDelay(300, 600);

      // Prefer SPA transition detection over waitForNavigation
      await this.waitForPageTransition();
      const afterUrl = this.page.url();
      if (afterUrl.includes('/nx/create-profile/overview')) {
        return this.createError(
          'OVERVIEW_STEP_STUCK',
          'URL did not change after clicking Next on overview step'
        );
      }

      logger.info('Overview step completed successfully');
      return this.createSuccess();

    } catch (error) {
      return this.createError(
        'OVERVIEW_STEP_FAILED',
        `Overview step failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Clear field and paste text using clipboard
  private async clearAndPaste(element: any, text: string): Promise<void> {
    try {
      // Focus the element
      await element.click();
      await this.randomDelay(100, 200);

      // Clear existing content (Ctrl+A, Backspace)
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('KeyA');
      await this.page.keyboard.up('Control');
      await this.randomDelay(100, 200);
      await this.page.keyboard.press('Backspace');
      await this.randomDelay(100, 200);

      // Copy text to clipboard and paste
      await this.page.evaluate((textToPaste) => {
        navigator.clipboard.writeText(textToPaste);
      }, text);
      await this.randomDelay(100, 200);

      // Paste using Ctrl+V
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('KeyV');
      await this.page.keyboard.up('Control');
      await this.randomDelay(200, 400);

      logger.info('Successfully pasted text using clipboard');
    } catch (error) {
      logger.warn('Clipboard paste failed, falling back to typing', error);
      // Fallback to typing if clipboard fails
      await this.clearAndType(element, text);
    }
  }
}
