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
  debug?: boolean;
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
      proxy: config.proxy ?? this.loadProxyConfigFromEnv(config.debug),
      debug: config.debug ?? false,
    };
  }

  private loadProxyConfigFromEnv(debugMode?: boolean): ProxyConfig | undefined {
    const host = process.env.PROXY_HOST;
    const envPort = process.env.PROXY_PORT;
    const username = process.env.PROXY_USER;
    const password = process.env.PROXY_PASS;
    const country = process.env.PROXY_COUNTRY;
    const rotateMinutes = process.env.PROXY_ROTATE_MINUTES;
    const zipCode = process.env.PROXY_ZIP_CODE;

    if (host && envPort && username && password) {
      // Determine port based on mode:
      // - Debug mode: Use sticky session (10001) to maintain login state
      // - Production mode: Use rotating (10000) for better anonymity
      const port = debugMode ? 10001 : 10000;
      
      return {
        host,
        port,
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
        const proxyMode = this.config.debug ? 'sticky (debug)' : 'rotating (production)';
        logger.info({ 
          proxyServer, 
          proxyHost, 
          port: this.config.proxy.port,
          mode: proxyMode 
        }, 'Using Decodo proxy server');
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
        // For Decodo, use the username exactly as provided (no modification needed)
        const username = this.config.proxy.username;
        
        await page.authenticate({
          username,
          password: this.config.proxy.password,
        });
        const proxyMode = this.config.debug ? 'sticky (debug)' : 'rotating (production)';
        logger.info({ 
          username, 
          country: this.config.proxy.country, 
          zipCode: this.config.proxy.zipCode,
          host: this.config.proxy.host,
          port: this.config.proxy.port,
          mode: proxyMode
        }, 'Decodo proxy authentication configured');
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
      
      // Clear localStorage and sessionStorage (only if not on about:blank)
      const currentUrl = page.url();
      if (currentUrl && currentUrl !== 'about:blank' && !currentUrl.startsWith('chrome://')) {
        try {
          await page.evaluate(() => {
            if (typeof Storage !== 'undefined') {
              localStorage.clear();
              sessionStorage.clear();
            }
          });
        } catch (storageError) {
          logger.debug('Storage clearing failed (this is normal for some pages):', storageError);
        }
      } else {
        logger.debug('Skipping storage clearing for special page:', currentUrl);
      }
      
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

  async getCurrentIP(page: Page): Promise<string | null> {
    try {
      logger.info('Checking current IP address...');
      
      // Navigate to IP check service
      await page.goto('https://httpbin.org/ip', {
        waitUntil: 'networkidle2',
        timeout: 15000,
      });

      // Extract IP information from the page
      const ipInfo = await page.evaluate(() => {
        const preElement = document.querySelector('pre');
        if (preElement) {
          try {
            const jsonData = JSON.parse(preElement.textContent || '{}');
            return jsonData;
          } catch (e) {
            return null;
          }
        }
        return null;
      });

      if (ipInfo && ipInfo.origin) {
        logger.info({ 
          ip: ipInfo.origin,
          proxyMode: this.config.debug ? 'sticky (debug)' : 'rotating (production)',
          proxyEnabled: this.isProxyEnabled()
        }, 'Current IP address detected');
        return ipInfo.origin;
      }

      logger.warn('Failed to extract IP information from response');
      return null;
    } catch (error) {
      logger.warn({ error }, 'Failed to check current IP address');
      return null;
    }
  }
}
