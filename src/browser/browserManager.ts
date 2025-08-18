import puppeteer from './puppeteer.js';
import { getLogger } from '../utils/logger.js';
import type { Browser, Page } from 'puppeteer';
import type { User } from '../types/database.js';

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
  user?: User; // Add user for proxy port management
  disableTrackingProtection?: boolean; // Disable tracking protection for headful mode
  skipProxyTest?: boolean; // Skip proxy testing and use direct connection
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
      proxy: config.skipProxyTest ? undefined : (config.proxy ?? this.loadProxyConfigFromEnv(config.user)),
      user: config.user,
      disableTrackingProtection: config.disableTrackingProtection ?? false,
      skipProxyTest: config.skipProxyTest ?? false,
    };
  }

  private loadProxyConfigFromEnv(user?: User): ProxyConfig | undefined {
    const host = process.env.PROXY_HOST;
    const envPort = process.env.PROXY_PORT;
    const username = process.env.PROXY_USER;
    const password = process.env.PROXY_PASS;
    const country = process.env.PROXY_COUNTRY;
    const zipCode = process.env.PROXY_ZIP_CODE;

    logger.info({ 
      host, 
      envPort, 
      username: username ? '***' : undefined, 
      password: password ? '***' : undefined,
      country,
      zipCode 
    }, 'Loading proxy configuration from environment');

    if (host && envPort && username && password) {
      let port: number;
      
      if (user) {
        // User-specific proxy port management (sticky mode)
        port = this.determineUserProxyPort(user);
      } else {
        // Default to sticky mode (port 10001+)
        port = parseInt(envPort, 10) || 10001;
      }
      
      const config = {
        host,
        port,
        username,
        password,
        country,
        rotateMinutes: undefined, // Disable rotating mode
        zipCode,
      };
      
      logger.info({ 
        host, 
        port, 
        username: '***', 
        country,
        zipCode 
      }, 'Proxy configuration loaded successfully');
      
      return config;
    } else {
      logger.warn('Incomplete proxy configuration - missing required environment variables');
      logger.info({ 
        hasHost: !!host, 
        hasPort: !!envPort, 
        hasUsername: !!username, 
        hasPassword: !!password 
      }, 'Proxy environment variable status');
      return undefined;
    }
  }
  
  // Getter methods for configuration
  isHeadless(): boolean {
    return this.config.headless;
  }
  
  isDebugMode(): boolean {
    return false; // Always return false since we removed debug mode
  }
  
  private async killExistingBrowserProcesses(): Promise<void> {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      // Kill any Chrome/Chromium processes that might be using our user data directory
      const commands = [
        `pkill -f "chrome.*${this.config.userDataDir}"`,
        `pkill -f "chromium.*${this.config.userDataDir}"`,
        `pkill -f "puppeteer.*${this.config.userDataDir}"`
      ];
      
      for (const command of commands) {
        try {
          await execAsync(command);
          logger.info(`Killed existing browser processes with command: ${command}`);
        } catch (error) {
          // Ignore errors if no processes were found
          logger.debug(`No existing processes found for command: ${command}`);
        }
      }
      
      // Wait a moment for processes to fully terminate
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      logger.warn('Failed to kill existing browser processes:', error);
    }
  }
  
  private determineUserProxyPort(user: User): number {
    // Check if user was flagged for captcha within the last 10 minutes
    if (user.captcha_flagged_at) {
      const captchaTime = new Date(user.captcha_flagged_at);
      const now = new Date();
      const timeDiff = now.getTime() - captchaTime.getTime();
      const minutesDiff = timeDiff / (1000 * 60);
      
      if (minutesDiff < 10) {
        // Within 10 minutes of captcha flag, increment proxy port
        const currentPort = user.last_proxy_port || 10001;
        const newPort = currentPort + 1;
        logger.info(`User ${user.id} captcha flagged ${minutesDiff.toFixed(1)} minutes ago, using proxy port ${newPort}`);
        return newPort;
      } else {
        // More than 10 minutes, reset to base port
        logger.info(`User ${user.id} captcha flag is ${minutesDiff.toFixed(1)} minutes old, using base proxy port 10001`);
        return 10001;
      }
    }
    
    // No captcha flag, use user's saved port or default
    const userPort = user.last_proxy_port || 10001;
    logger.info(`User ${user.id} using saved proxy port ${userPort}`);
    return userPort;
  }

  async launch(): Promise<Browser> {
    if (this.browser) {
      return this.browser;
    }

    try {
      logger.info('Launching browser...');
      
      // Kill any existing browser processes that might be using the same user data dir
      await this.killExistingBrowserProcesses();
      
      let args: string[];

      if (this.config.disableTrackingProtection && !this.config.headless) {
        // System Chrome mode - very minimal arguments for natural browsing
        args = [
          '--user-data-dir=' + this.config.userDataDir,
          '--disable-blink-features=AutomationControlled', // Hide automation detection
        ];
        logger.info('Using minimal arguments for system Chrome browser');
      } else {
        // Headless or automation mode - full arguments for stability
        args = [
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
          '--disable-extensions',
          '--disable-plugins',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
        ];
        logger.info('Using full browser arguments for headless/automation mode');
      }

      // Add proxy configuration if available
      if (this.config.proxy) {
        try {
          // For Decodo, the host should be country.decodo.com format
          const proxyHost = this.config.proxy.country 
            ? `${this.config.proxy.country}.decodo.com`
            : this.config.proxy.host;
          
          const proxyServer = `${proxyHost}:${this.config.proxy.port}`;
          args.push(`--proxy-server=${proxyServer}`);
          logger.info({ 
            proxyServer, 
            proxyHost, 
            port: this.config.proxy.port,
            mode: 'sticky (10-minute sessions)'
          }, 'Using Decodo proxy server');
        } catch (error) {
          logger.error('Failed to configure proxy, continuing without proxy:', error);
          // Continue without proxy if configuration fails
        }
      } else {
        logger.info('No proxy configuration found, using direct connection');
      }
      
      const launchOptions: any = {
        headless: this.config.headless,
        args,
        defaultViewport: this.config.viewport,
        timeout: this.config.timeout,
      };

      if (this.config.disableTrackingProtection && !this.config.headless) {
        // Try to use system Chrome first for natural browsing experience
        try {
          launchOptions.channel = 'chrome';
          launchOptions.ignoreDefaultArgs = false; // Use all default Chrome arguments
          logger.info('Attempting to use system Chrome browser for natural headful browsing');
          this.browser = await puppeteer.launch(launchOptions);
        } catch (error) {
          logger.warn('System Chrome not found, falling back to Chromium with natural settings');
          // Fallback to Chromium but with more natural settings
          launchOptions.channel = undefined;
          launchOptions.ignoreDefaultArgs = false; // Still use default args for more natural behavior
          this.browser = await puppeteer.launch(launchOptions);
        }
      } else {
        // Use Chromium for automation/headless mode and restore-session
        launchOptions.ignoreDefaultArgs = ['--disable-extensions'];
        logger.info('Using Chromium for automation/headless mode');
        this.browser = await puppeteer.launch(launchOptions);
      }

      logger.info('Browser launched successfully');
      return this.browser;
    } catch (error) {
      logger.error(error, 'Failed to launch browser');
      
      // Try to clean up any partial browser state
      if (this.browser) {
        try {
          await this.browser.close();
        } catch (closeError) {
          logger.warn('Failed to close browser during error cleanup:', closeError);
        }
        this.browser = null;
      }
      
      throw error;
    }
  }

  async newPage(user?: User): Promise<Page> {
    const browser = await this.launch();
    
    try {
      const page = await browser.newPage();
      
      // If user is provided, update proxy configuration for this page
      if (user && this.config.proxy) {
        const userProxyPort = this.determineUserProxyPort(user);
        if (userProxyPort !== this.config.proxy.port) {
          logger.info(`Updating proxy port for user ${user.id} from ${this.config.proxy.port} to ${userProxyPort}`);
          // Note: We can't change proxy port for an existing browser, but we can log it
          // The actual proxy port change would need to happen at browser launch time
        }
      }
      
      // Set default timeout
      page.setDefaultTimeout(this.config.timeout);
      page.setDefaultNavigationTimeout(this.config.timeout);
      
      // Authenticate with proxy if configured
      if (this.config.proxy) {
        try {
          // For Decodo, use the username exactly as provided (no modification needed)
          const username = this.config.proxy.username;
          
          await page.authenticate({
            username,
            password: this.config.proxy.password,
          });
          logger.info({ 
            username, 
            country: this.config.proxy.country, 
            zipCode: this.config.proxy.zipCode,
            host: this.config.proxy.host,
            port: this.config.proxy.port,
            mode: 'sticky (10-minute sessions)'
          }, 'Decodo proxy authentication configured');
        } catch (error) {
          logger.error('Failed to authenticate with proxy, continuing without proxy:', error);
          // Continue without proxy if authentication fails
        }
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
        logger.info('Browser closed successfully');
      } catch (error) {
        logger.error(error, 'Failed to close browser');
      }
    }
    
    // Also kill any remaining browser processes
    try {
      await this.killExistingBrowserProcesses();
    } catch (error) {
      logger.warn('Failed to kill remaining browser processes during cleanup:', error);
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
          proxyMode: 'sticky (10-minute sessions)',
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
