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
      defaultValue: () => true
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
    
    // Inject the interception script for challenge sites (following 2captcha docs exactly)
    if (siteUrl.includes('cloudflare-turnstile-challenge')) {
      await page.evaluateOnNewDocument(() => {
        console.clear = () => console.log('Console was cleared');
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
                json: 1,
              };
              // we will intercept the message in puppeteer
              console.log('intercepted-params:' + JSON.stringify(params));
              (window as any).cfCallback = b.callback;
              return;
            };
          }
        }, 50);
      });
      
      // Alternative approach: Intercept api.js requests and replace with custom script
      await page.setRequestInterception(true);
      page.on('request', (request: any) => {
        if (request.url().includes('api.js') && request.url().includes('challenges.cloudflare.com')) {
          logger.info('Intercepting api.js request, replacing with custom script');
          request.respond({
            status: 200,
            contentType: 'application/javascript',
            body: `
              // Custom api.js replacement
              window.turnstile = {
                render: function(container, options) {
                  let params = {
                    sitekey: options.sitekey,
                    pageurl: window.location.href,
                    data: options.cData,
                    pagedata: options.chlPageData,
                    action: options.action,
                    userAgent: navigator.userAgent,
                    json: 1,
                  };
                  console.log('intercepted-params:' + JSON.stringify(params));
                  window.cfCallback = options.callback;
                }
              };
            `
          });
        } else {
          request.continue();
        }
      });
    }
    
    // Navigate to the site
    logger.info(`Navigating to: ${siteUrl}`);
    await page.goto(siteUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait for the page to be fully loaded
    logger.info('Waiting for page to be fully loaded...');
    
    // Wait for DOM to be ready
    await page.waitForFunction(() => {
      return document.readyState === 'complete';
    }, { timeout: 10000 });
    
    // Additional wait for dynamic content
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // For challenge sites, wait for Turnstile widget to be present
    if (siteUrl.includes('cloudflare-turnstile-challenge')) {
      logger.info('Waiting for Turnstile widget to load...');
      try {
        // Wait for either the turnstile iframe or the turnstile div
        await page.waitForFunction(() => {
          const iframe = document.querySelector('iframe[src*="challenges.cloudflare.com"]');
          const turnstileDiv = document.querySelector('.cf-turnstile');
          return iframe || turnstileDiv;
        }, { timeout: 15000 });
        logger.info('Turnstile widget detected');
      } catch (error) {
        logger.warn('Turnstile widget not found, continuing anyway...');
      }
    }
    
    // For regular sites, wait for the cf-turnstile div
    else {
      logger.info('Waiting for cf-turnstile div...');
      try {
        await page.waitForSelector('.cf-turnstile', { timeout: 10000 });
        logger.info('cf-turnstile div found');
      } catch (error) {
        logger.warn('cf-turnstile div not found, continuing anyway...');
      }
    }
    
    // Set up console message listener for challenge sites
    let interceptedParams: any = null;
    if (siteUrl.includes('cloudflare-turnstile-challenge')) {
      page.on('console', async (msg: any) => {
        const txt = msg.text();
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
    
    // For 2captcha demo pages, look for the checkbox first
    logger.info('Looking for verification checkbox...');
    
    try {
      // Wait for the checkbox using XPath
      const checkboxXPath = "//div[@class='cb-c' and @role='alert']//input[@type='checkbox']";
      const checkbox = await page.waitForXPath(checkboxXPath, { timeout: 10000 });
      
      if (checkbox) {
        logger.info('Found verification checkbox, clicking it...');
        await checkbox.click();
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Wait for the checkbox to be checked
        await page.waitForFunction(() => {
          const checkbox = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
          return checkbox && checkbox.checked;
        }, { timeout: 10000 });
        
        logger.info('Checkbox clicked and verified');
      }
    } catch (error) {
      logger.info('No checkbox found, proceeding with iframe detection...');
    }
    
    let result: any;
    
    if (siteUrl.includes('cloudflare-turnstile-challenge')) {
      // For challenge sites, wait for intercepted parameters
      logger.info('Waiting for intercepted parameters...');
      
      // Wait for the turnstile widget to load first
      try {
        await page.waitForSelector('iframe[src*="challenges.cloudflare.com"]', { timeout: 15000 });
        logger.info('Turnstile iframe found, waiting for parameters...');
      } catch (error) {
        logger.warn('Turnstile iframe not found, continuing anyway...');
      }
      
      // Wait for parameters with better logging and more robust detection
      let attempts = 0;
      const maxAttempts = 200; // Increased from 150
      while (!interceptedParams && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
        
        // Log progress every 20 attempts
        if (attempts % 20 === 0) {
          logger.info(`Waiting for parameters... (${attempts}/${maxAttempts}) - ${(attempts/maxAttempts*100).toFixed(1)}%`);
          
          // Check if turnstile is available and try to trigger it
          const turnstileAvailable = await page.evaluate(() => {
            return !!(window as any).turnstile;
          });
          
          if (turnstileAvailable && attempts > 50) {
            logger.info('Turnstile object found, attempting to trigger render...');
            await page.evaluate(() => {
              const turnstileDiv = document.querySelector('.cf-turnstile');
              if (turnstileDiv && (window as any).turnstile) {
                (window as any).turnstile.render(turnstileDiv, {
                  sitekey: '0x4AAAAAAAD7Dju0CMHhJHhh',
                  callback: (token: string) => {
                    console.log('Manual callback triggered with token:', token);
                  }
                });
              }
            });
          }
        }
      }
      
      if (!interceptedParams) {
        logger.warn('Failed to intercept parameters after maximum attempts, trying fallbacks...');
        
        // FALLBACK 1: Try to manually trigger the turnstile render
        logger.info('Attempting to manually trigger turnstile render...');
        await page.evaluate(() => {
          const turnstileDiv = document.querySelector('.cf-turnstile');
          if (turnstileDiv && (window as any).turnstile) {
            (window as any).turnstile.render(turnstileDiv, {
              sitekey: '0x4AAAAAAAD7Dju0CMHhJHhh',
              callback: (token: string) => {
                console.log('Manual callback triggered with token:', token);
              }
            });
          }
        });
        
        // Wait a bit more
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        if (!interceptedParams) {
          // FALLBACK 2: Try to extract parameters from the page directly
          logger.info('Attempting to extract parameters from page directly...');
          const extractedParams = await page.evaluate(() => {
            // Look for any script tags that might contain turnstile configuration
            const scripts = document.querySelectorAll('script');
            for (const script of scripts) {
              const content = script.textContent || '';
              if (content.includes('turnstile') && content.includes('sitekey')) {
                // Try to extract sitekey from script content
                const sitekeyMatch = content.match(/sitekey['"]?\s*:\s*['"]([^'"]+)['"]/);
                if (sitekeyMatch) {
                  return {
                    sitekey: sitekeyMatch[1],
                    pageurl: window.location.href,
                    data: '',
                    pagedata: '',
                    action: 'verify',
                    userAgent: navigator.userAgent,
                    json: 1,
                  };
                }
              }
            }
            
            // Look for data attributes on turnstile elements
            const turnstileElement = document.querySelector('.cf-turnstile, [data-sitekey]');
            if (turnstileElement) {
              const sitekey = turnstileElement.getAttribute('data-sitekey');
              if (sitekey) {
                return {
                  sitekey,
                  pageurl: window.location.href,
                  data: '',
                  pagedata: '',
                  action: 'verify',
                  userAgent: navigator.userAgent,
                  json: 1,
                };
              }
            }
            
            return null;
          });
          
          if (extractedParams) {
            interceptedParams = extractedParams;
            logger.info('Extracted parameters from page:', interceptedParams);
          } else {
            // FALLBACK 3: Use a known sitekey for the demo page
            logger.info('Using fallback sitekey for demo page...');
            interceptedParams = {
              sitekey: '0x4AAAAAAAD7Dju0CMHhJHhh',
              pageurl: siteUrl,
              data: '',
              pagedata: '',
              action: 'verify',
              userAgent: await page.evaluate(() => navigator.userAgent),
              json: 1,
            };
          }
        }
      }
      
      logger.info('Solving challenge with intercepted parameters...');
      // For challenge sites, use turnstile method with intercepted parameters
      // Use the basic turnstile method with sitekey and pageurl
      result = await solver.turnstile(interceptedParams.sitekey, interceptedParams.pageurl);
    } else {
      // For regular sites, look for the cf-turnstile div with data-sitekey attribute
      logger.info('Looking for cf-turnstile div with data-sitekey...');
      const turnstileDiv = await page.waitForSelector('.cf-turnstile[data-sitekey]', { 
        timeout: 10000 
      });
      
      if (!turnstileDiv) {
        throw new Error('cf-turnstile div with data-sitekey not found');
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
    
    // Execute the token in the page (following 2captcha docs exactly)
    await page.evaluate((token: string, isChallengeSite: boolean) => {
      if (isChallengeSite) {
        // For challenge sites, execute the callback directly as per docs
        if ((window as any).cfCallback) {
          (window as any).cfCallback(token);
          console.log('Challenge callback executed with token');
        } else {
          // Fallback: try to find and execute any callback function
          const callbacks = Object.keys(window).filter(key => key.toLowerCase().includes('callback'));
          for (const callbackName of callbacks) {
            if (typeof (window as any)[callbackName] === 'function') {
              (window as any)[callbackName](token);
              console.log(`Executed callback: ${callbackName}`);
              break;
            }
          }
        }
      } else {
        // For regular sites, set the token in inputs
        const turnstileResponseInput = document.querySelector('[name="cf-turnstile-response"]') as HTMLInputElement;
        if (turnstileResponseInput) {
          turnstileResponseInput.value = token;
          console.log('Token set in cf-turnstile-response input');
        }
        
        // Also try the g-recaptcha-response input for compatibility
        const recaptchaResponseInput = document.querySelector('[name="g-recaptcha-response"]') as HTMLInputElement;
        if (recaptchaResponseInput) {
          recaptchaResponseInput.value = token;
          console.log('Token set in g-recaptcha-response input');
        }
      }
      
      // Find the turnstile widget and set the token
      const turnstileWidget = (window as any).turnstile;
      if (turnstileWidget) {
        const siteKeyElement = document.querySelector('.cf-turnstile[data-sitekey]') as HTMLElement;
        const siteKey = siteKeyElement?.getAttribute('data-sitekey');
        if (siteKey) {
          turnstileWidget.render('.cf-turnstile', {
            sitekey: siteKey,
            callback: (token: string) => {
              console.log('Turnstile callback executed with token:', token);
            }
          });
        }
      }
      
      // Alternative: try to find and fill any hidden input
      const inputs = document.querySelectorAll('input[type="hidden"]');
      inputs.forEach((input: any) => {
        if (input.name && input.name.toLowerCase().includes('captcha')) {
          input.value = token;
        }
      });
      
      // Trigger form submission by clicking submit button or pressing enter
      const submitButton = document.querySelector('button[type="submit"], input[type="submit"], .submit-btn');
      if (submitButton) {
        (submitButton as HTMLElement).click();
        console.log('Submit button clicked');
      } else {
        // Try to submit any form
        const forms = document.querySelectorAll('form');
        forms.forEach((form: any) => {
          if (form.querySelector('input[type="hidden"]')) {
            form.submit();
            console.log('Form submitted');
          }
        });
      }
    }, result.data, siteUrl.includes('cloudflare-turnstile-challenge'));
    
    // Wait for success indication
    const successTimeout = setTimeout(() => {
      throw new Error('Timeout waiting for success indication');
    }, timeoutMs);
    
    try {
      // Look for success indicators with more specific checks
      await page.waitForFunction(() => {
        const body = document.body.textContent || '';
        const url = window.location.href;
        
        // Check for success text
        if (body.includes('success') || body.includes('verified') || body.includes('passed')) {
          return true;
        }
        
        // Check for success elements
        if (document.querySelector('.success, [data-success="true"], .alert-success')) {
          return true;
        }
        
        // Check if we're redirected to a success page
        if (url.includes('success') || url.includes('verified')) {
          return true;
        }
        
                 // Check if the turnstile widget is hidden (indicating success)
         const turnstileWidget = document.querySelector('.cf-turnstile') as HTMLElement;
         if (turnstileWidget && turnstileWidget.style.display === 'none') {
           return true;
         }
        
        // Check if there's a success message in the page
        const successElements = document.querySelectorAll('*');
        for (const element of successElements) {
          const text = element.textContent || '';
          if (text.includes('Verification successful') || text.includes('Challenge passed')) {
            return true;
          }
        }
        
        return false;
      }, { timeout: timeoutMs });
      
      clearTimeout(successTimeout);
      logger.info('Success indication found!');
      return true;
      
    } catch (error) {
      clearTimeout(successTimeout);
      
      // Check if we're still on the same page (might indicate success)
      const currentUrl = page.url();
      if (currentUrl !== siteUrl) {
        logger.info('Page redirected, assuming success');
        return true;
      }
      
      // Check for any error messages
      const errorElements = await page.$$('.error, .failure, [data-error]');
      if (errorElements.length > 0) {
        logger.warn('Error elements found on page');
        return false;
      }
      
      // If no clear success/failure indication, assume failure
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
