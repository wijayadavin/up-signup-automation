import puppeteer from './puppeteer.js';
import { getLogger } from '../utils/logger.js';
import type { Browser, Page } from 'puppeteer';

const logger = getLogger(import.meta.url);

export interface BrowserConfig {
  headless: boolean;
  timeout: number;
  userDataDir: string;
  viewport: {
    width: number;
    height: number;
  };
}

export class BrowserManager {
  private browser: Browser | null = null;
  private config: BrowserConfig;

  constructor(config: Partial<BrowserConfig> = {}) {
    this.config = {
      headless: config.headless ?? (process.env.PUPPETEER_HEADLESS === 'true'),
      timeout: config.timeout ?? Number(process.env.PUPPETEER_TIMEOUT) ?? 30000,
      userDataDir: config.userDataDir ?? (process.env.PUPPETEER_USER_DATA_DIR ?? './user-data'),
      viewport: config.viewport ?? { width: 1920, height: 1080 },
    };
  }

  async launch(): Promise<Browser> {
    if (this.browser) {
      return this.browser;
    }

    try {
      logger.info('Launching browser...');
      
      this.browser = await puppeteer.launch({
        headless: this.config.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-features=TranslateUI',
          '--disable-ipc-flooding-protection',
          '--user-data-dir=' + this.config.userDataDir,
        ],
        defaultViewport: this.config.viewport,
        timeout: this.config.timeout,
      });

      logger.info('Browser launched successfully');
      return this.browser;
    } catch (error) {
      logger.error(error, 'Failed to launch browser');
      throw error;
    }
  }

  async newPage(): Promise<Page> {
    const browser = await this.launch();
    
    try {
      const page = await browser.newPage();
      
      // Set default timeout
      page.setDefaultTimeout(this.config.timeout);
      page.setDefaultNavigationTimeout(this.config.timeout);
      
      // Set user agent
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // Set extra headers
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      });

      logger.info('New page created');
      return page;
    } catch (error) {
      logger.error(error, 'Failed to create new page');
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
        this.browser = null;
        logger.info('Browser closed');
      } catch (error) {
        logger.error(error, 'Failed to close browser');
        throw error;
      }
    }
  }

  async isConnected(): Promise<boolean> {
    return this.browser?.isConnected() ?? false;
  }

  getBrowser(): Browser | null {
    return this.browser;
  }
}
