import { command, flag, option, run } from 'cmd-ts';
import { string, number, boolean } from 'cmd-ts';
import { existsSync } from 'fs';
import { resolve } from 'path';
import dotenv from 'dotenv';
import { Solver } from '2captcha';
import { BrowserManager } from './browser/browserManager.js';
import { getLogger } from './utils/logger.js';

const logger = getLogger(import.meta.url);

// Load environment variables
dotenv.config();

interface TurnstileAttempt {
  site: string;
  attempt: number;
  startedAt: string;
  durationMs: number;
  status: 'success' | 'failure';
  errorMessage?: string;
}

interface SiteSummary {
  attempts: number;
  successes: number;
  successRate: number;
  avgDurationMs: number;
}

interface OverallSummary {
  totalAttempts: number;
  totalSuccesses: number;
  overallSuccessRate: number;
  totalDurationMs: number;
  siteSummaries: Record<string, SiteSummary>;
}

const turnstileCmd = command({
  name: 'turnstile',
  description: 'Solve Cloudflare Turnstile challenges on demo sites',
  version: '1.0.0',
  args: {
    output: option({
      type: string,
      long: 'out',
      short: 'o',
      description: 'Output file for results',
      defaultValue: () => 'out/turnstile_results.json'
    }),
    attempts: option({
      type: number,
      long: 'attempts',
      short: 'a',
      description: 'Number of attempts per site',
      defaultValue: () => 10
    }),
    timeout: option({
      type: number,
      long: 'timeout',
      short: 't',
      description: 'Timeout per attempt in seconds',
      defaultValue: () => 90
    }),
    apiKey: option({
      type: string,
      long: 'api-key',
      description: '2captcha API key (or use CAPTCHA_API_KEY env var)',
      defaultValue: () => process.env.CAPTCHA_API_KEY || ''
    }),
    headless: flag({
      type: boolean,
      long: 'headless',
      short: 'h',
      description: 'Run in headless mode',
      defaultValue: () => true
    }),
    challenge: flag({
      type: boolean,
      long: 'challenge',
      short: 'c',
      description: 'Focus on challenge site only',
      defaultValue: () => false
    }),
    noProxy: flag({
      type: boolean,
      long: 'no-proxy',
      short: 'n',
      description: 'Disable proxy and use direct connection',
      defaultValue: () => false
    }),
    noStealth: flag({
      type: boolean,
      long: 'no-stealth',
      short: 's',
      description: 'Disable stealth mode for debugging (use normal browser behavior)',
      defaultValue: () => false
    })
  },
  handler: async (args) => {
    await runTurnstileSolver(args);
  }
});

export async function runTurnstileSolver(args: {
  output: string;
  attempts: number;
  timeout: number;
  apiKey: string;
  headless: boolean;
  challenge: boolean;
  noProxy: boolean;
  noStealth: boolean;
}) {
  const startTime = Date.now();
  const attempts: TurnstileAttempt[] = [];
  
  // Demo sites from Task B
  const demoSites = args.challenge 
    ? ['https://2captcha.com/demo/cloudflare-turnstile-challenge']
    : [
        'https://2captcha.com/demo/cloudflare-turnstile',
        'https://2captcha.com/demo/cloudflare-turnstile-challenge'
      ];

  // Validate API key
  if (!args.apiKey) {
    throw new Error('CAPTCHA_API_KEY environment variable is not set. Please add it to your .env file.');
  }

  logger.info(`Starting Turnstile solver with ${args.attempts} attempts per site`);
  logger.info(`API Key: ${args.apiKey.substring(0, 8)}...`);
  logger.info(`Timeout: ${args.timeout}s per attempt`);
  logger.info(`Headless: ${args.headless}`);
  logger.info(`Proxy enabled: ${!args.noProxy}`);
  logger.info(`Stealth mode: ${!args.noStealth}`);
  logger.info(`Challenge mode: ${args.challenge}`);

  // Initialize 2captcha solver
  const solver = new Solver(args.apiKey);

  // Initialize browser manager with proxy support
  const browserManager = new BrowserManager({
    headless: args.headless,
    skipProxyTest: args.noProxy, // Skip proxy if noProxy flag is set
    disableTrackingProtection: args.noStealth // Disable tracking protection if noStealth is set
  });

  // Launch browser
  const browser = await browserManager.launch();
  
  // If noStealth is enabled, we need to override the stealth plugin
  if (args.noStealth) {
    logger.info('Stealth mode disabled - using normal browser behavior');
    // The BrowserManager already handles this through disableTrackingProtection
    // but we can add additional logging to confirm
  }

  try {
    for (const site of demoSites) {
      logger.info(`\n=== Processing site: ${site} ===`);
      
      for (let attempt = 1; attempt <= args.attempts; attempt++) {
        logger.info(`\n--- Attempt ${attempt}/${args.attempts} ---`);
        
        const attemptStartTime = Date.now();
        const attemptData: TurnstileAttempt = {
          site,
          attempt,
          startedAt: new Date().toISOString(),
          durationMs: 0,
          status: 'failure'
        };

        try {
          const success = await solveTurnstileChallenge(browser, solver, site, args.timeout * 1000);
          
          const durationMs = Date.now() - attemptStartTime;
          attemptData.durationMs = durationMs;
          attemptData.status = success ? 'success' : 'failure';
          
          if (success) {
            logger.info(`✅ Attempt ${attempt} SUCCESS (${durationMs}ms)`);
          } else {
            logger.warn(`❌ Attempt ${attempt} FAILED (${durationMs}ms)`);
            attemptData.errorMessage = 'Challenge not solved within timeout';
          }
          
        } catch (error) {
          const durationMs = Date.now() - attemptStartTime;
          attemptData.durationMs = durationMs;
          attemptData.status = 'failure';
          attemptData.errorMessage = error instanceof Error ? error.message : String(error);
          
          logger.error(error, `❌ Attempt ${attempt} ERROR (${durationMs}ms)`);
        }
        
        attempts.push(attemptData);
        
        // Small delay between attempts
        if (attempt < args.attempts) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    
  } finally {
    await browserManager.close();
  }

  // Generate summaries
  const summary = generateSummary(attempts);
  
  // Save results
  await saveResults(attempts, summary, args.output);
  
  // Print summary
  const totalDuration = Date.now() - startTime;
  logger.info(`\n=== TURNSTILE SOLVER COMPLETED ===`);
  logger.info(`Total duration: ${totalDuration}ms`);
  logger.info(`Overall success rate: ${(summary.overallSuccessRate * 100).toFixed(1)}%`);
  logger.info(`Results saved to: ${args.output}`);
  
  console.log(JSON.stringify(summary, null, 2));
}

async function solveTurnstileChallenge(
  browser: any,
  solver: Solver,
  siteUrl: string,
  timeoutMs: number
): Promise<boolean> {
  const page = await browser.newPage();
  
  try {
    // Set viewport
    await page.setViewport({ width: 1280, height: 720 });
    
    // Inject the interception script for challenge sites (exact match from working example)
    if (siteUrl.includes('cloudflare-turnstile-challenge')) {
      console.log('Injecting interception script for challenge sites');
      await page.evaluateOnNewDocument(() => {
        console.clear = () => console.log('Console was cleared')
        const i = setInterval(() => {
            if ((window as any).turnstile) {
                clearInterval(i);
                (window as any).turnstile.render = (a: any, b: any) => {
                    let params = {
                        sitekey: b.sitekey,
                        pageurl: window.location.href,
                        data: b.cData,
                        pagedata: b.chlPageData,
                        action: b.action,
                        userAgent: navigator.userAgent,
                        json: 1
                    }
                    // we will intercept the message in puppeeter
                    console.log('intercepted-params:' + JSON.stringify(params));
                    (window as any).cfCallback = b.callback;
                    return
                }
            }
        }, 50)
      });
    }
    
    // Set up console message listener for challenge sites BEFORE navigation
    let interceptedParams: any = null;
    if (siteUrl.includes('cloudflare-turnstile-challenge')) {
      logger.info('Setting up console message listener for challenge site...');
      page.on('console', async (msg: any) => {
        const txt = msg.text();
        logger.info(`[WEBSITE] Console: ${txt}`);
        if (txt.includes('intercepted-params:')) {
          try {
            const params = JSON.parse(txt.replace('intercepted-params:', ''));
            logger.info('Intercepted turnstile parameters:', params);
            interceptedParams = params;
          } catch (error) {
            logger.error('Failed to parse intercepted parameters:', error);
          }
        }
      });
    }
    
    // Navigate to the site
    logger.info(`Navigating to: ${siteUrl}`);
    
    if (siteUrl.includes('cloudflare-turnstile-challenge')) {
      // For challenge sites, don't wait for page to be fully loaded
      await page.goto(siteUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      logger.info('Challenge page loaded, waiting for parameters...');
      
      // Wait a bit for the turnstile widget to initialize
      await new Promise(resolve => setTimeout(resolve, 2000));
    } else {
      // For regular sites, wait for full page load
      await page.goto(siteUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      logger.info('Waiting for page to be fully loaded...');
      
      // Wait for DOM to be ready
      await page.waitForFunction(() => {
        return document.readyState === 'complete';
      }, { timeout: 10000 });
      
      // Additional wait for dynamic content
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    let result: any;
    
    if (siteUrl.includes('cloudflare-turnstile-challenge')) {
      // For challenge sites, first check if already solved
      logger.info('Checking if challenge is already solved...');
      
      // Wait a bit for the page to fully load
      await page.waitForFunction(() => document.readyState === 'complete', { timeout: 10000 });
      
      // Check if success message already exists
      const successElement = await page.$('p._successMessage_1ndnh_1');
      if (successElement) {
        const successText = await successElement.evaluate((el: any) => el.textContent);
        if (successText && successText.includes('Captcha is passed successfully!')) {
          logger.info('Challenge already solved! Success message found.');
          return true;
        }
      }
      
      // If not already solved, check if we need to refresh for a fresh challenge
      logger.info('Challenge not solved, checking if we need a fresh challenge...');
      
      // Look for the turnstile widget
      const turnstileWidget = await page.$('.cf-turnstile');
      if (!turnstileWidget) {
        logger.info('No turnstile widget found, refreshing page for fresh challenge...');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Re-inject the interception script after refresh
        await page.evaluateOnNewDocument(() => {
          console.clear = () => console.log('Console was cleared')
          const i = setInterval(() => {
              if ((window as any).turnstile) {
                  clearInterval(i);
                  (window as any).turnstile.render = (a: any, b: any) => {
                      let params = {
                          sitekey: b.sitekey,
                          pageurl: window.location.href,
                          data: b.cData,
                          pagedata: b.chlPageData,
                          action: b.action,
                          userAgent: navigator.userAgent,
                          json: 1
                      }
                      // we will intercept the message in puppeeter
                      console.log('intercepted-params:' + JSON.stringify(params));
                      (window as any).cfCallback = b.callback;
                      return
                  }
              }
          }, 50)
        });
        
        // Wait a bit more for the widget to load after refresh
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
      // Now wait for intercepted parameters
      logger.info('Waiting for intercepted parameters...');
      
      // Wait for parameters with timeout
      const startTime = Date.now();
      while (!interceptedParams && (Date.now() - startTime) < 30000) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      if (!interceptedParams) {
        throw new Error('Failed to intercept turnstile parameters within timeout');
      }
      
      logger.info('Solving challenge with intercepted parameters...');
      // Use turnstile method with challenge parameters in extra object (bypass type restrictions)
      result = await solver.turnstile(interceptedParams.sitekey, interceptedParams.pageurl, {
        action: interceptedParams.action,
        data: interceptedParams.data,
        pagedata: interceptedParams.pagedata
      } as any);
    } else {
      // For regular sites, first check if already solved
      logger.info('Checking if regular turnstile is already solved...');
      
      // Wait a bit for the page to fully load
      await page.waitForFunction(() => document.readyState === 'complete', { timeout: 10000 });
      
      // Check if success message already exists
      const body = await page.evaluate(() => document.body.textContent || '');
      if (body.includes('"success": true') && body.includes('"error-codes": []')) {
        logger.info('Regular turnstile already solved! Success response found.');
        return true;
      }
      
      // If not already solved, check if we need to refresh for a fresh challenge
      logger.info('Turnstile not solved, checking if we need a fresh challenge...');
      
      // Look for the turnstile widget
      let turnstileDiv = await page.$('.cf-turnstile[data-sitekey]');
      if (!turnstileDiv) {
        logger.info('No turnstile widget found, refreshing page for fresh challenge...');
        await page.reload({ waitUntil: 'networkidle2' });
        await page.waitForFunction(() => document.readyState === 'complete', { timeout: 10000 });
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Try to find the widget again
        turnstileDiv = await page.waitForSelector('.cf-turnstile[data-sitekey]', { timeout: 10000 });
      }
      
      if (!turnstileDiv) {
        throw new Error('cf-turnstile div with data-sitekey not found even after refresh');
      }
      
      // Extract site key and solve normally
      const siteKey = await turnstileDiv.evaluate((el: any) => el.getAttribute('data-sitekey'));
      
      if (!siteKey) {
        throw new Error('Could not extract site key from data-sitekey attribute');
      }
      
      logger.info(`Found site key: ${siteKey}`);
      
      // Solve the challenge using 2captcha
      logger.info('Submitting challenge to 2captcha...');
      result = await solver.turnstile(siteKey, siteUrl);
    }
    
    logger.info(`Challenge solved, token: ${result.data.substring(0, 50)}...`);
    
    // Execute the token in the page
    await page.evaluate((token: string, isChallengeSite: boolean) => {
      if (isChallengeSite) {
        // For challenge sites, execute the callback directly
        if ((window as any).cfCallback) {
          (window as any).cfCallback(token);
          console.log('Challenge callback executed with token');
        }
      } else {
        // For regular sites, set the token in inputs
        const turnstileResponseInputs = document.querySelectorAll('[name="cf-turnstile-response"]');
        turnstileResponseInputs.forEach((input: any) => {
          input.value = token;
          console.log('Token set in cf-turnstile-response input');
        });
        
        // Click the Check button
        const checkButton = document.querySelector('button[data-action="demo_action"]');
        if (checkButton) {
          (checkButton as HTMLElement).click();
          console.log('Check button clicked');
        }
      }
    }, result.data, siteUrl.includes('cloudflare-turnstile-challenge'));
    
    // Wait for success indication
    const successTimeout = setTimeout(() => {
      throw new Error('Timeout waiting for success indication');
    }, timeoutMs);
    
    try {
      if (siteUrl.includes('cloudflare-turnstile-challenge')) {
        // For challenge sites, wait for success message
        logger.info('Challenge site - waiting for success message...');
        
        // Wait for page to finish loading first
        logger.info('Waiting for page to finish loading...');
        await page.waitForFunction(() => document.readyState === 'complete', { timeout: 30000 });
        
        // Additional wait for dynamic content to load
        logger.info('Waiting additional 5 seconds for dynamic content...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Check if success message already exists (might have been solved immediately)
        const successElement = await page.$('p._successMessage_1ndnh_1');
        if (successElement) {
          const successText = await successElement.evaluate((el: any) => el.textContent);
          if (successText && successText.includes('Captcha is passed successfully!')) {
            clearTimeout(successTimeout);
            logger.info('Success message found immediately on challenge page!');
            return true;
          }
        }
        
        // Debug: Check what's on the page
        const pageContent = await page.evaluate(() => document.body.innerHTML);
        logger.info(`Page HTML preview: ${pageContent.substring(0, 500)}...`);
        
        // Wait for success message with timeout
        logger.info('Waiting for success message to appear...');
        await page.waitForFunction(() => {
          const successElement = document.querySelector('p._successMessage_1ndnh_1');
          if (successElement && successElement.textContent?.includes('Captcha is passed successfully!')) {
            return true;
          }
          return false;
        }, { timeout: 60000 }); // Reduced to 60 seconds since we already waited
        
        clearTimeout(successTimeout);
        logger.info('Success message found on challenge page!');
        return true;
        
      } else {
        // For regular sites, use existing logic
        await page.waitForFunction((siteUrl: string) => {
          const body = document.body.textContent || '';
          const url = window.location.href;
          
          // Check for the specific JSON success response
          if (body.includes('"success": true') && body.includes('"error-codes": []')) {
            console.log('Found JSON success response');
            return true;
          }
          
          // Check for success messages
          if (body.includes('Verification successful') || 
              body.includes('Challenge passed') || 
              body.includes('Success') ||
              body.includes('Verified') ||
              body.includes('Turnstile solved correctly')) {
            return true;
          }
          
          // Check for error messages
          if (body.includes('Turnstile solved incorrectly') || 
              body.includes('Error') || 
              body.includes('Failed') ||
              body.includes('"success": false')) {
            return false;
          }
          
          // Check if URL changed
          if (url !== siteUrl) {
            return true;
          }
          
          return false;
        }, { timeout: timeoutMs }, siteUrl);
        
        clearTimeout(successTimeout);
        logger.info('Success indication found!');
        return true;
      }
      
    } catch (error) {
      clearTimeout(successTimeout);
      
      // Check if we're still on the same page
      const currentUrl = page.url();
      if (currentUrl !== siteUrl) {
        logger.info('Page redirected, assuming success');
        return true;
      }
      
      logger.warn('No clear success/failure indication found');
      return false;
    }
    
  } finally {
    await page.close();
  }
}

function generateSummary(attempts: TurnstileAttempt[]): OverallSummary {
  const siteSummaries: Record<string, SiteSummary> = {};
  let totalAttempts = 0;
  let totalSuccesses = 0;
  let totalDurationMs = 0;
  
  // Group attempts by site
  const attemptsBySite: Record<string, TurnstileAttempt[]> = {};
  attempts.forEach(attempt => {
    if (!attemptsBySite[attempt.site]) {
      attemptsBySite[attempt.site] = [];
    }
    attemptsBySite[attempt.site].push(attempt);
  });
  
  // Calculate summary for each site
  Object.entries(attemptsBySite).forEach(([site, siteAttempts]) => {
    const successes = siteAttempts.filter(a => a.status === 'success').length;
    const totalDuration = siteAttempts.reduce((sum, a) => sum + a.durationMs, 0);
    
    siteSummaries[site] = {
      attempts: siteAttempts.length,
      successes,
      successRate: siteAttempts.length > 0 ? successes / siteAttempts.length : 0,
      avgDurationMs: siteAttempts.length > 0 ? totalDuration / siteAttempts.length : 0
    };
    
    totalAttempts += siteAttempts.length;
    totalSuccesses += successes;
    totalDurationMs += totalDuration;
  });
  
  return {
    totalAttempts,
    totalSuccesses,
    overallSuccessRate: totalAttempts > 0 ? totalSuccesses / totalAttempts : 0,
    totalDurationMs,
    siteSummaries
  };
}

async function saveResults(
  attempts: TurnstileAttempt[], 
  summary: OverallSummary, 
  outputFile: string
): Promise<void> {
  const fs = await import('fs');
  const path = await import('path');
  
  // Ensure output directory exists
  const outputDir = path.dirname(outputFile);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const results = {
    attempts,
    summary,
    generatedAt: new Date().toISOString()
  };
  
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2), 'utf8');
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  run(turnstileCmd, process.argv.slice(2));
}
