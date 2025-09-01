import { Page } from 'puppeteer';
import { getLogger } from '../utils/logger.js';
import { getDatabase } from '../database/connection.js';

const logger = getLogger(import.meta.url);

export interface SessionState {
  cookies: Array<{
    origin: string;
    items: Array<{
      name: string;
      value: string;
      domain: string;
      path: string;
      httpOnly: boolean;
      secure: boolean;
      sameSite: string;
      expires?: number;
    }>;
  }>;
  storage: Array<{
    origin: string;
    localStorage: Record<string, string>;
  }>;
  meta: {
    ua: string;
    tz: string;
    lang: string;
    proxy_label?: string;
  };
}

export class SessionService {
  static async saveSessionState(page: Page, userId: number): Promise<void> {
    try {
      logger.info(`Saving session state for user ${userId}`);
      
      // Get cookies
      const cookies = await page.cookies();
      const cookieGroups = this.groupCookiesByOrigin(cookies);
      
      // Get localStorage
      const localStorage = await page.evaluate(() => {
        const storage: Record<string, string> = {};
        const length = window.localStorage.length;
        for (let i = 0; i < length; i++) {
          const key = window.localStorage.key(i);
          if (key) {
            storage[key] = window.localStorage.getItem(key) || '';
          }
        }
        return storage;
      });
      
      // Get meta information
      const meta = await page.evaluate(() => ({
        ua: navigator.userAgent,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        lang: navigator.language,
      }));
      
      const sessionState: SessionState = {
        cookies: cookieGroups,
        storage: [{
          origin,
          localStorage
        }],
        meta
      };
      
      // Convert to base64
      const sessionStateJson = JSON.stringify(sessionState);
      const sessionStateBase64 = Buffer.from(sessionStateJson).toString('base64');
      
      // Save to database
      const db = getDatabase();
      await db
        .updateTable('users')
        .set({
          last_session_state: sessionStateBase64,
          updated_at: new Date()
        })
        .where('id', '=', userId)
        .execute();
      
      logger.info(`Session state saved for user ${userId}`);
    } catch (error) {
      logger.error(error, `Failed to save session state for user ${userId}`);
      throw error;
    }
  }
  
  static async loadSessionState(page: Page, userId: number): Promise<boolean> {
    try {
      logger.info(`Loading session state for user ${userId}`);
      
      const db = getDatabase();
      const user = await db
        .selectFrom('users')
        .select('last_session_state')
        .where('id', '=', userId)
        .executeTakeFirst();
      
      if (!user?.last_session_state) {
        logger.info(`No session state found for user ${userId}`);
        return false;
      }
      
      // Decode from base64
      const sessionStateJson = Buffer.from(user.last_session_state, 'base64').toString();
      const sessionState: SessionState = JSON.parse(sessionStateJson);
      
      // Set cookies
      for (const cookieGroup of sessionState.cookies) {
        for (const cookie of cookieGroup.items) {
          await page.setCookie({
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path,
            httpOnly: cookie.httpOnly,
            secure: cookie.secure,
            sameSite: cookie.sameSite as any,
            expires: cookie.expires
          });
        }
      }
      
      // Set user agent first
      if (sessionState.meta.ua) {
        await page.setUserAgent(sessionState.meta.ua);
      }

       // Set cookies (after UA for fidelity)
       for (const cookieGroup of sessionState.cookies) {
         for (const cookie of cookieGroup.items) {
           await page.setCookie({
             name: cookie.name,
             value: cookie.value,
             domain: cookie.domain,
             path: cookie.path,
             httpOnly: cookie.httpOnly,
             secure: cookie.secure,
             sameSite: cookie.sameSite as any,
             expires: cookie.expires
           });
         }
       }

      // Set localStorage - navigate to each origin carefully
      for (const storageGroup of sessionState.storage) {
        try {
           const targetOrigin = (() => {
             try { return new URL(storageGroup.origin).origin; }
             catch { return 'https://www.upwork.com'; }
           })();
           logger.info(`Setting localStorage for origin: ${targetOrigin}`);
           await page.goto(targetOrigin, { waitUntil: 'domcontentloaded', timeout: 15000 });          
          await page.evaluate((localStorageData) => {
            for (const [key, value] of Object.entries(localStorageData)) {
              window.localStorage.setItem(key, value);
            }
          }, storageGroup.localStorage);
          
          logger.info(`localStorage set for ${storageGroup.origin}`);
        } catch (storageError) {
          logger.warn(`Failed to set localStorage for ${storageGroup.origin}:`, storageError);
          // Continue with other origins even if one fails
        }
      }
      
      logger.info(`Session state loaded for user ${userId}`);
      return true;
    } catch (error) {
      logger.error(error, `Failed to load session state for user ${userId}`);
      return false;
    }
  }
  
  private static groupCookiesByOrigin(cookies: any[]): Array<{ origin: string; items: any[] }> {
    const groups: Record<string, any[]> = {};
    
    for (const cookie of cookies) {
      const origin = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
      if (!groups[origin]) {
        groups[origin] = [];
      }
      groups[origin].push(cookie);
    }
    
    return Object.entries(groups).map(([origin, items]) => ({ origin, items }));
  }
  
  static async markOnboardingCompleted(userId: number, proxyPort: number = 10001): Promise<void> {
    try {
      logger.info(`Marking onboarding as completed for user ${userId} with proxy port ${proxyPort}`);
      
      const db = getDatabase();
      await db
        .updateTable('users')
        .set({
          onboarding_completed_at: new Date(),
          last_proxy_port: proxyPort,
          updated_at: new Date()
        })
        .where('id', '=', userId)
        .execute();
      
      logger.info(`Onboarding marked as completed for user ${userId}`);
    } catch (error) {
      logger.error(error, `Failed to mark onboarding as completed for user ${userId}`);
      throw error;
    }
  }
  
  static async restoreSessionAndOpenLocationPage(userId: number, headful: boolean = false): Promise<void> {
    try {
      logger.info(`Restoring session and opening location page for user ${userId} in ${headful ? 'headful' : 'headless'} mode`);
      
      const db = getDatabase();
      const user = await db
        .selectFrom('users')
        .select(['last_session_state', 'last_proxy_port', 'first_name', 'last_name'])
        .where('id', '=', userId)
        .executeTakeFirst();
      
      if (!user?.last_session_state) {
        throw new Error(`No session state found for user ${userId}`);
      }
      
      // Import required modules dynamically
      const { BrowserManager } = await import('../browser/browserManager.js');
      
      const proxyPort = user.last_proxy_port || 10001;
      logger.info(`Using proxy port ${proxyPort} for user ${userId}`);

       // Build Decodo username once: user-<session>[-country-xx][-zip-xxxxx]
       const baseUser = process.env.PROXY_USER || 'spmmd0qqan'; // fallback for dev
       const unameParts = [baseUser];
       if (process.env.PROXY_COUNTRY) unameParts.push(`country-${process.env.PROXY_COUNTRY}`);
       if (process.env.PROXY_ZIP_CODE) unameParts.push(`zip-${process.env.PROXY_ZIP_CODE}`);
       const proxyUsername = unameParts.join('-');
       const proxyPassword = process.env.PROXY_PASS || 'sZ0aawg5H8ma+mH1fO'; // fallback for dev


      // Create browser manager with specified mode and proxy
      const browserManager = new BrowserManager({ 
        headless: !headful, // Invert headful flag for headless setting
        disableTrackingProtection: false, // Always use Chromium for consistency
        proxy: {
          host: 'us.decodo.com',
          port: proxyPort,
          username: proxyUsername,
          password: proxyPassword,
        }
      });
      
      // Launch browser and get page
      const browser = await browserManager.launch();
      const page = await browser.newPage();
      // CRITICAL: authenticate BEFORE any navigation/evaluate
      await page.authenticate({ username: proxyUsername, password: proxyPassword });
      logger.info(`[Proxy] Auth applied for us.decodo.com:${proxyPort} as ${proxyUsername}`);

      // Restore session state
      const sessionLoaded = await this.loadSessionState(page, userId);
      if (!sessionLoaded) {
        throw new Error(`Failed to load session state for user ${userId}`);
      }
      
      // Navigate to location page with better error handling
      logger.info(`Navigating to location page for user ${user.first_name} ${user.last_name}`);
      try {
        await page.goto('https://www.upwork.com/nx/create-profile/location', { 
           waitUntil: 'domcontentloaded',
           timeout: 15000
        });
        logger.info('Successfully navigated to location page');
      } catch (navigationError) {
        logger.warn('Failed to navigate to location page, trying main Upwork page instead:', navigationError);
        // Fallback to main Upwork page
        try {
          await page.goto('https://www.upwork.com', { 
            waitUntil: 'domcontentloaded',
            timeout: 15000
          });
          logger.info('Navigated to main Upwork page as fallback');
        } catch (e2) {
          logger.warn('Fallback to main page failed, retrying with networkidle2');
          await page.goto('https://www.upwork.com', { waitUntil: 'networkidle2', timeout: 20000 });
          logger.info('Navigated to main Upwork page after retry');
        }
        logger.info('Navigated to main Upwork page as fallback');
      }
      
      logger.info(`Location page opened for user ${userId}. Browser will remain open.`);
      logger.info('Press Ctrl+C to close the browser when you are done.');
      
      // Keep browser open - listen for process termination
      process.on('SIGINT', async () => {
        logger.info('Received SIGINT, closing browser...');
        await browserManager.close();
        process.exit(0);
      });
      
      process.on('SIGTERM', async () => {
        logger.info('Received SIGTERM, closing browser...');
        await browserManager.close();
        process.exit(0);
      });
      
    } catch (error) {
      logger.error(error, `Failed to restore session and open location page for user ${userId}`);
      throw error;
    }
  }
}
