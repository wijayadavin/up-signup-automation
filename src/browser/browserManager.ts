import puppeteer from './puppeteer.js';
import { getLogger } from '../utils/logger.js';
import type { Browser, Page } from 'puppeteer';

const logger = getLogger(import.meta.url);

export interface ProxyConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  country?: string;
  rotateMinutes?: number;
  // Decodo specific fields
  zipCode?: string;
}

export interface BrowserConfig {
  headless: boolean;
  timeout: number;
  userDataDir: string;
  viewport: {
    width: number;
    height: number;
  };
  proxy?: ProxyConfig;
}

export class BrowserManager {
  private browser: Browser | null = null;
  private config: BrowserConfig;

  constructor(config: Partial<BrowserConfig> = {}) {
    this.config = {
      headless: config.headless ?? (process.env.PUPPETEER_HEADLESS === 'true'),
      timeout: config.timeout ?? Number(process.env.PUPPETEER_TIMEOUT) ?? 30000,
      userDataDir: config.userDataDir ?? (process.env.PUPPETEER_USER_DATA_DIR ?? './user-data'),
      viewport: config.viewport ?? { width: 1440, height: 1080 },
      proxy: config.proxy ?? this.loadProxyConfigFromEnv(),
    };
  }

  private loadProxyConfigFromEnv(): ProxyConfig | undefined {
    const host = process.env.PROXY_HOST;
    const port = process.env.PROXY_PORT;
    const username = process.env.PROXY_USER;
    const password = process.env.PROXY_PASS;
    const country = process.env.PROXY_COUNTRY;
    const rotateMinutes = process.env.PROXY_ROTATE_MINUTES;
    const zipCode = process.env.PROXY_ZIP_CODE;

    if (host && port && username && password) {
      return {
        host,
        port: parseInt(port, 10),
        username,
        password,
        country,
        rotateMinutes: rotateMinutes ? parseInt(rotateMinutes, 10) : undefined,
        zipCode,
      };
    }

    return undefined;
  }

  async launch(): Promise<Browser> {
    if (this.browser) {
      return this.browser;
    }

    try {
      logger.info('Launching browser...');
      
      const args = [
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
      ];

      // Add proxy configuration if available
      if (this.config.proxy) {
        // For Decodo, the host should be country.decodo.com format
        const proxyHost = this.config.proxy.country 
          ? `${this.config.proxy.country}.decodo.com`
          : this.config.proxy.host;
        
        const proxyServer = `${proxyHost}:${this.config.proxy.port}`;
        args.push(`--proxy-server=${proxyServer}`);
        logger.info({ proxyServer, proxyHost, port: this.config.proxy.port }, 'Using Decodo proxy server');
      }
      
      this.browser = await puppeteer.launch({
        headless: this.config.headless,
        args,
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
      
      // Authenticate with proxy if configured
      if (this.config.proxy) {
        // For Decodo, construct the username with country and zip if available
        let username = this.config.proxy.username;
        
        // Check if username already contains country information
        const hasCountryInUsername = username.includes('-country-');
        const hasZipInUsername = username.includes('-zip-');
        
        if (!hasCountryInUsername && this.config.proxy.country && this.config.proxy.zipCode) {
          // Format: user-{session}-country-{country}-zip-{zip}
          username = `${this.config.proxy.username}-country-${this.config.proxy.country}-zip-${this.config.proxy.zipCode}`;
        } else if (!hasCountryInUsername && this.config.proxy.country) {
          // Format: user-{session}-country-{country}
          username = `${this.config.proxy.username}-country-${this.config.proxy.country}`;
        }
        
        await page.authenticate({
          username,
          password: this.config.proxy.password,
        });
        logger.info({ username, country: this.config.proxy.country, zipCode: this.config.proxy.zipCode }, 'Decodo proxy authentication configured');
      }
      
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

  async clearBrowserState(page: Page): Promise<void> {
    try {
      logger.info('Clearing browser state...');
      
      // Clear all cookies
      const client = await page.target().createCDPSession();
      await client.send('Network.clearBrowserCookies');
      
      // Clear localStorage and sessionStorage
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      
      // Clear cache
      await client.send('Network.clearBrowserCache');
      
      logger.info('Browser state cleared successfully');
    } catch (error) {
      logger.warn(error, 'Failed to clear browser state, continuing...');
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

  getProxyInfo(): ProxyConfig | undefined {
    return this.config.proxy;
  }

  isProxyEnabled(): boolean {
    return !!this.config.proxy;
  }
}
