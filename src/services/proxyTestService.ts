import { BrowserManager } from '../browser/browserManager.js';
import { Page } from 'puppeteer';

const logger = {
  info: (message: string, ...args: any[]) => console.log(`[INFO] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[WARN] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[ERROR] ${message}`, ...args),
  debug: (message: string, ...args: any[]) => console.log(`[DEBUG] ${message}`, ...args),
};

export interface ProxyTestResult {
  success: boolean;
  ip?: string;
  error?: string;
  details?: any;
}

export class ProxyTestService {
  private browserManager: BrowserManager;

  constructor(browserManager: BrowserManager) {
    this.browserManager = browserManager;
  }

  async testProxyConnection(): Promise<ProxyTestResult> {
    let page: Page | null = null;
    let tempBrowserManager: BrowserManager | null = null;
    
    try {
      // Check if proxy is enabled
      if (!this.browserManager.isProxyEnabled()) {
        return {
          success: false,
          error: 'No proxy configuration found'
        };
      }

      // Log proxy configuration
      const proxyInfo = this.browserManager.getProxyInfo();
      const proxyHost = proxyInfo?.country 
        ? `${proxyInfo.country}.decodo.com`
        : proxyInfo?.host;
      
      const proxyMode = proxyInfo?.port === 10001 ? 'sticky (debug)' : 'rotating (production)';
      logger.info(`Testing proxy configuration - Host: ${proxyHost}, Port: ${proxyInfo?.port}, Mode: ${proxyMode}, Country: ${proxyInfo?.country}, Username: ${proxyInfo?.username}`);

      // Check if the existing browser manager is connected
      const isConnected = await this.browserManager.isConnected();
      
      if (!isConnected) {
        logger.info('Existing browser manager is not connected, creating new one for proxy test');
        // Create a temporary browser manager for proxy testing
        const { BrowserManager } = await import('../browser/browserManager.js');
        tempBrowserManager = new BrowserManager({ 
          headless: true // Always use headless for proxy tests
        });
        page = await tempBrowserManager.newPage();
      } else {
        // Use existing browser manager
        page = await this.browserManager.newPage();
      }
      logger.info('Testing proxy connection...');

      // Try multiple IP check services
      const ipServices = [
        'https://httpbin.org/ip',
        'https://api.ipify.org?format=json',
        'https://ip.decodo.com/json'
      ];

      let ipInfo = null;
      for (const service of ipServices) {
        try {
          logger.info(`Trying IP service: ${service}`);
          await page.goto(service, {
            waitUntil: 'networkidle2',
            timeout: 20000,
          });
          break; // If successful, exit loop
        } catch (error) {
          logger.warn(`Failed to load ${service}, trying next service...`);
          if (service === ipServices[ipServices.length - 1]) {
            throw error; // If last service fails, throw error
          }
        }
      }

      // Wait for page to load and extract IP information
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Extract IP information from the page with multiple fallbacks
      ipInfo = await page.evaluate(() => {
        // Strategy 1: Look for <pre> element (httpbin.org format)
        const pre = document.querySelector('pre');
        if (pre && pre.textContent) {
          try {
            const content = pre.textContent.trim();
            return JSON.parse(content);
          } catch (e) {
            return { source: 'pre', error: 'Failed to parse', content: pre.textContent };
          }
        }

        // Strategy 2: Look for JSON anywhere in the page
        const bodyText = document.body.textContent || '';

        // Try different JSON patterns for different services
        const jsonPatterns = [
          /\{[^}]*"origin"[^}]*\}/,  // httpbin.org format
          /\{[^}]*"ip"[^}]*\}/,      // ipify.org format
          /\{[^}]*"country"[^}]*\}/ // decodo.com format
        ];

        for (const pattern of jsonPatterns) {
          const jsonMatch = bodyText.match(pattern);
          if (jsonMatch) {
            try {
              return JSON.parse(jsonMatch[0]);
            } catch (e) {
              // Continue to next pattern
            }
          }
        }

        // Strategy 3: Look for IP pattern in text
        const ipPattern = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/;
        const ipMatch = bodyText.match(ipPattern);
        if (ipMatch) {
          return { origin: ipMatch[0], source: 'pattern' };
        }

        // Strategy 4: Return page content for debugging
        return { 
          error: 'No IP found', 
          bodyContent: bodyText.substring(0, 500)
        };
      });

      if (ipInfo.error) {
        logger.error(`Failed to extract IP information from proxy test: ${JSON.stringify(ipInfo)}`);
        return {
          success: false,
          error: 'Failed to extract IP information',
          details: ipInfo
        };
      }

      const currentIP = ipInfo.origin || ipInfo.ip || 'unknown';
      logger.info('Successfully connected through proxy');
      logger.info(`Proxy IP Information - Current IP: ${currentIP}, Full Response: ${JSON.stringify(ipInfo)}`);

      return {
        success: true,
        ip: currentIP,
        details: ipInfo
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to test proxy configuration: ${errorMessage}`);

      // Provide specific error information
      let specificError = 'Proxy test failed';
      if (error instanceof Error) {
        if (error.message.includes('ERR_TUNNEL_CONNECTION_FAILED')) {
          specificError = 'Proxy connection failed - check proxy credentials and server';
        } else if (error.message.includes('TimeoutError')) {
          specificError = 'Proxy test timed out - proxy server may be slow or unreachable';
        } else if (error.message.includes('net::ERR_PROXY_AUTH_FAILED')) {
          specificError = 'Proxy authentication failed - check username and password';
        }
      }

      return {
        success: false,
        error: specificError,
        details: { originalError: errorMessage }
      };

    } finally {
      if (page) {
        try {
          await page.close();
        } catch (error) {
          // Page might already be closed
        }
      }
      
      // Clean up temporary browser manager if we created one
      if (tempBrowserManager) {
        try {
          await tempBrowserManager.close();
          logger.info('Temporary browser manager closed');
        } catch (error) {
          logger.warn('Failed to close temporary browser manager:', error);
        }
      }
    }
  }

  async testProxyWithRetry(maxRetries: number = 3, retryDelay: number = 15000): Promise<ProxyTestResult> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.info(`Proxy test attempt ${attempt}/${maxRetries}`);
      
      const result = await this.testProxyConnection();
      
      if (result.success) {
        logger.info(`✅ Proxy test successful on attempt ${attempt}`);
        return result;
      }

      if (attempt < maxRetries) {
        logger.warn(`❌ Proxy test failed on attempt ${attempt}, retrying in ${retryDelay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      } else {
        logger.error(`❌ Proxy test failed after ${maxRetries} attempts`);
      }
    }

    return {
      success: false,
      error: `Proxy test failed after ${maxRetries} attempts`
    };
  }
}
