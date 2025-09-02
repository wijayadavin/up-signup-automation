import { command, flag, option, run } from 'cmd-ts';
import { string, number, boolean } from 'cmd-ts';
import { z } from 'zod';
import dotenv from 'dotenv';
import { getLogger } from './utils/logger.js';
import { runMigrations } from './database/migrate.js';
import { closeDatabase } from './database/connection.js';
import { BrowserManager } from './browser/browserManager.js';
import { UserService } from './services/userService.js';
import { LoginService } from './services/loginService.js';
import { SessionService } from './services/sessionService.js';

// Load environment variables
dotenv.config();

const logger = getLogger(import.meta.url);

// CLI command definition for Task A
const upworkJobCrawlerCmd = command({
  name: 'upwork-job-crawler',
  description: 'Crawl Upwork job listings and extract job details',
  args: {
    pages: option({
      type: number,
      long: 'pages',
      short: 'p',
      description: 'Number of pages to crawl (default: 25)',
      defaultValue: () => 25,
    }),
    out: option({
      type: string,
      long: 'out',
      short: 'o',
      description: 'Output file path (default: out/jobs.json)',
      defaultValue: () => 'out/jobs.json',
    }),
    headless: flag({
      type: boolean,
      long: 'headless',
      short: 'h',
      description: 'Run browser in headless mode',
      defaultValue: () => true,
    }),
    userId: option({
      type: number,
      long: 'user-id',
      description: 'User ID for authentication (optional)',
      defaultValue: () => 0,
    }),
    restoreSession: flag({
      type: boolean,
      long: 'restore-session',
      short: 'r',
      description: 'Restore existing session instead of starting from login',
      defaultValue: () => false,
    }),
    onlyPostprocess: flag({
      type: boolean,
      long: 'only-postprocess',
      description: 'Only run postprocessing on existing jobs.json file',
      defaultValue: () => false,
    }),
  },
  handler: async (args) => {
    try {
      if (args.onlyPostprocess) {
        // Only run postprocessing
        logger.info('Running postprocessing only...');
        await postprocessJobsFile(args.out);
        logger.info('Postprocessing completed successfully');
      } else {
        // Run full job crawler
        await runUpworkJobCrawler({
          pages: args.pages,
          out: args.out,
          headless: args.headless,
          userId: args.userId > 0 ? args.userId : undefined,
          restoreSession: args.restoreSession,
        });
        
        // Run postprocessing after successful crawling
        logger.info('Running postprocessing on extracted jobs...');
        await postprocessJobsFile(args.out);
        logger.info('Postprocessing completed successfully');
      }
    } catch (error) {
      logger.error(error, 'Failed to run upwork job crawler');
      process.exit(1);
    }
  },
});

// Main function for Task A
async function runUpworkJobCrawler(options: {
  pages: number;
  out: string;
  headless: boolean;
  userId?: number;
  restoreSession: boolean;
}) {
  const startTime = Date.now();
  let pagesVisited = 0;
  let jobsCollected = 0;
  let uniqueJobIds = new Set<string>();
  let failures: string[] = [];
  
  try {
    logger.info('Starting Upwork job crawler for Task A...');
    
    // Run migrations
    await runMigrations();
    
    // Initialize browser manager
    const browserManager = new BrowserManager({ 
      headless: options.headless,
      disableTrackingProtection: false
    });

    // Perform job crawling
    const result = await crawlJobsForTaskA(
      browserManager, 
      options.pages, 
      options.out, 
      options.restoreSession, 
      options.userId
    );
    
    // Update statistics
    pagesVisited = result.pagesVisited;
    jobsCollected = result.jobsCollected;
    uniqueJobIds = result.uniqueJobIds;
    failures = result.failures;
    
    // Cleanup
    await closeDatabase();
    
  } catch (error) {
    logger.error(error, 'Failed to run upwork job crawler');
    throw error;
  } finally {
    // Print summary as required by Task A
    const durationMs = Date.now() - startTime;
    const summary = {
      pagesVisited,
      jobsCollected,
      uniqueJobIds: uniqueJobIds.size,
      durationMs,
      failures
    };
    
    console.log(JSON.stringify(summary, null, 2));
  }
}

/**
 * Extract job data from the current page
 */
async function extractJobsFromPage(page: any, pageNum: number): Promise<any[]> {
  return await page.evaluate((pageNumber: number) => {
    const jobs: any[] = [];
    
    // Find all job tiles on the page - be more specific to avoid conflicts
    let jobTiles = document.querySelectorAll('[data-test="job-tile-list"] section[data-ev-sublocation="job_feed_tile"]');
    
    // Fallback to alternative selector if the first one doesn't work
    if (jobTiles.length === 0) {
      const fallbackTiles = document.querySelectorAll('[data-test="job-tile-list"] section.air3-card-section');
      if (fallbackTiles.length > 0) {
        jobTiles = fallbackTiles;
      }
    }
    
    jobTiles.forEach((tile, index) => {
      try {
        // Extract job title and URL
        const titleElement = tile.querySelector('h3 a');
        const title = titleElement?.textContent?.trim() || '';
        const jobUrl = titleElement?.getAttribute('href') || '';
        
        // Extract job ID from URL
        let jobId = '';
        if (jobUrl) {
          const idMatch = jobUrl.match(/_~0([0-9a-z]+)\//i) || jobUrl.match(/_~([0-9a-z]+)/i);
          jobId = idMatch?.[1] ? `~0${idMatch[1]}` : '';
        }
        
        // Extract description
        const descriptionElement = tile.querySelector('[data-test="job-description-text"]');
        const description = descriptionElement?.textContent?.trim() || '';
        
        // Extract skills/tags
        const skillElements = tile.querySelectorAll('[data-test="attr-item"]');
        const skills = Array.from(skillElements).map(el => el.textContent?.trim()).filter(Boolean);
        
        // Extract project type, hourly rate, and budget
        const typeElement = tile.querySelector('[data-test="job-type"]');
        const typeText = typeElement?.textContent || '';
        let projectType = 'hourly';
        let hourly = null;
        let budget = null;
        
        // Check if it's a fixed-price project
        if (typeText.toLowerCase().includes('fixed')) {
          projectType = 'fixed';
          
          // Look for budget in the separate budget element first
          const budgetElement = tile.querySelector('[data-test="budget"]');
          if (budgetElement) {
            const budgetText = budgetElement.textContent?.trim() || '';
            const budgetMatch = budgetText.match(/\$(\d+(?:,\d+)?)/);
            if (budgetMatch) {
              budget = {
                amount: parseInt(budgetMatch[1].replace(',', ''), 10),
                currency: 'USD'
              };
            }
          } else {
            // Fallback: try to extract budget from type text
            const budgetMatch = typeText.match(/\$(\d+(?:,\d+)?)/);
            if (budgetMatch) {
              budget = {
                amount: parseInt(budgetMatch[1].replace(',', ''), 10),
                currency: 'USD'
              };
            }
          }
        } else {
          // Hourly project - extract rate range
          projectType = 'hourly';
          
                  // Look for hourly rate in the type text
        const hourlyMatch = typeText.match(/\$(\d+)\s*-\s*\$?(\d+)/);
        if (hourlyMatch) {
          hourly = {
            min: parseInt(hourlyMatch[1], 10),
            max: parseInt(hourlyMatch[2], 10),
            currency: 'USD'
          };
        } else {
          // Try to extract single hourly rate
          const singleHourlyMatch = typeText.match(/\$(\d+)/);
          if (singleHourlyMatch) {
            const rate = parseInt(singleHourlyMatch[1], 10);
            hourly = {
              min: rate,
              max: rate,
              currency: 'USD'
            };
          }
        }
        }
        
        // Extract experience level
        const experienceElement = tile.querySelector('[data-test="contractor-tier"]');
        const experienceLevel = experienceElement?.textContent?.trim() || '';
        
        // Extract duration/estimated time
        const durationElement = tile.querySelector('[data-test="duration"]');
        const duration = durationElement?.textContent?.trim() || '';
        
        // Extract posted time
        const postedElement = tile.querySelector('[data-test="posted-on"]');
        const postedAt = postedElement?.textContent?.trim() || '';
        
        // Extract proposals count
        const proposalsElement = tile.querySelector('[data-test="proposals"]');
        const proposals = proposalsElement?.textContent?.trim() || '';
        
        // Extract client information
        const clientCountryElement = tile.querySelector('[data-test="client-country"]');
        const clientCountry = clientCountryElement?.textContent?.trim() || '';
        
        const verifiedElement = tile.querySelector('[data-test="payment-verification-status"]');
        const paymentVerified = verifiedElement?.textContent?.includes('verified') || false;
        
        // Extract client rating
        const ratingElement = tile.querySelector('.air3-rating-foreground');
        let rating = 0;
        if (ratingElement) {
          const style = ratingElement.getAttribute('style');
          const widthMatch = style?.match(/width:\s*(\d+)px/);
          if (widthMatch) {
            const width = parseInt(widthMatch[1], 10);
            rating = Math.round((width / 78) * 5 * 10) / 10; // Assuming 78px = 5.0 stars
          }
        }
        
        // Extract total spent
        const spentElement = tile.querySelector('[data-test="formatted-amount"]');
        const totalSpent = spentElement?.textContent?.trim() || '$0';
        
        // Extract job opening UID (from data attribute)
        const openingUid = tile.getAttribute('data-ev-opening_uid') || '';
        
        // Create comprehensive job object
        const job = {
          jobId,
          openingUid,
          title,
          url: jobUrl.startsWith('http') ? jobUrl : `https://www.upwork.com${jobUrl}`,
          description,
          skills,
          projectType,
          experienceLevel,
          duration,
          budget,
          hourly,
          postedAt,
          proposals,
          connectsRequired: null, // Not visible in tile view
          client: {
            country: clientCountry,
            paymentVerified,
            rating,
            totalSpent,
            hires: 0, // Not available in tile view
            jobsPosted: 0 // Not available in tile view
          },
          pageNumber: pageNumber,
          extractedAt: new Date().toISOString()
        };
        
        if (jobId && title) {
          jobs.push(job);
        }
        
      } catch (error) {
        console.error('Error extracting job data:', error);
      }
    });
    
    return jobs;
  }, pageNum);
}

/**
 * Save jobs to JSONL file (one job per line) as required by Task A
 */
async function saveJobsToFile(jobs: any[], outputFile: string): Promise<void> {
  const fs = await import('fs');
  const path = await import('path');
  
  // Ensure output directory exists
  const outputDir = path.dirname(outputFile);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Save as JSONL (one job per line) as required by Task A
  const jsonlContent = jobs.map(job => JSON.stringify(job)).join('\n');
  fs.writeFileSync(outputFile, jsonlContent, 'utf8');
}

async function crawlJobsForTaskA(
  browserManager: BrowserManager, 
  pages: number, 
  outputFile: string, 
  restoreSession: boolean = false, 
  userId?: number
): Promise<{
  pagesVisited: number;
  jobsCollected: number;
  uniqueJobIds: Set<string>;
  failures: string[];
}> {
  let jobCrawlerBrowserManager: BrowserManager | null = null;
  let page: any = null;
  let pagesVisited = 0;
  let jobsCollected = 0;
  const uniqueJobIds = new Set<string>();
  const failures: string[] = [];
  
  try {
    // Initialize services
    const userService = new UserService();
    const loginService = new LoginService(userService);
    
    // If user ID is provided, perform login first
    if (userId) {
      logger.info(`Performing login for user ID: ${userId}`);
      
      try {
        // Get user from database
        logger.info('Fetching user from database...');
        const user = await userService.getUserById(userId);
        if (!user) {
          throw new Error(`User with ID ${userId} not found`);
        }
        logger.info(`User found: ${user.email} (${user.country_code})`);
        
        // For job crawling, we only need basic authentication
        // Let's try to restore session first, then do basic login if needed
        logger.info('Attempting to restore existing session for job crawling...');
        
        let loginResult;
        if (restoreSession) {
          // Try to restore session first
          try {
            const restored = await SessionService.loadSessionState(page, userId);
            if (restored) {
              logger.info('Session restored successfully, checking if we can access job pages...');
              
              // Test if we can access job pages with restored session
              await page.goto('https://www.upwork.com/nx/find-work/best-matches', { 
                waitUntil: 'domcontentloaded', 
                timeout: 15000 
              });
              
              const currentUrl = page.url();
              if (currentUrl.includes('/nx/find-work/') || currentUrl.includes('/nx/dashboard/')) {
                logger.info('✅ Session restored and can access job pages');
                loginResult = {
                  success: true,
                  loginResult: { stage: 'login', url: currentUrl }
                };
              } else {
                logger.info('Session restored but cannot access job pages, proceeding with login');
                restoreSession = false; // Fall back to login
              }
            }
          } catch (error) {
            logger.warn('Failed to restore session:', error);
            restoreSession = false; // Fall back to login
          }
        }
        
        // If session restoration failed or wasn't attempted, do basic login
        if (!loginResult || !loginResult.success) {
          logger.info('Performing basic login for job crawling...');
          loginResult = await loginService.performLogin(user, {
            restoreSession: false, // Don't restore session during login
            skipOtp: true, // Skip OTP for job crawling
            skipLocation: true, // Skip location for job crawling
          }, browserManager);
        }
        
        logger.info(`Login result status: ${loginResult.success ? 'SUCCESS' : 'FAILED'}`);
        if (loginResult.loginResult) {
          logger.info(`Login stage: ${loginResult.loginResult.stage}, URL: ${loginResult.loginResult.url}`);
        }
        
        // For Task A, we consider it successful if we can access job pages
        // Even if login automation reports failure, if we're on a job-related page, we can proceed
        if (!loginResult.success) {
          logger.warn(`Login automation reported failure: ${loginResult.errorMessage} (Code: ${loginResult.errorCode})`);
          
          // Check if we're actually on a job-related page (which means login worked)
          if (loginResult.loginResult?.url && 
              (loginResult.loginResult.url.includes('/nx/find-work/') || 
               loginResult.loginResult.url.includes('/nx/dashboard/'))) {
            logger.info('✅ Login actually successful - we can access job pages, proceeding with crawling');
          } else {
            throw new Error(`Login failed: ${loginResult.errorMessage} (Code: ${loginResult.errorCode})`);
          }
        }
        
        // Use the page and browser manager from login result
        page = loginResult.page;
        jobCrawlerBrowserManager = loginResult.browserManager || null;
        
        if (!page) {
          throw new Error('Login succeeded but no page returned');
        }
        
        logger.info('✅ Login successful, proceeding with job crawling');

        // Save session after successful login
        try {
          logger.info('Saving session state after successful login...');
          await SessionService.saveSessionState(page, userId);
          logger.info('Session state saved successfully');
        } catch (error) {
          logger.warn('Failed to save session state:', error);
        }
        
      } catch (error) {
        logger.error(error, 'Error during login process');
        throw error;
      }
    } else {
      // Create a new browser instance for job crawling
      jobCrawlerBrowserManager = new BrowserManager({ 
        headless: false, // Set to false for debugging
        disableTrackingProtection: false
      });
      
      page = await jobCrawlerBrowserManager.newPage();
      logger.info('Starting job crawling process without authentication...');
    }
    
    // Navigate directly to the most recent page
    logger.info('Navigating directly to Most Recent page...');
    try {
      await page.goto('https://www.upwork.com/nx/find-work/most-recent', { waitUntil: 'networkidle2' });
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const updatedUrl = page.url();
      logger.info(`Updated URL: ${updatedUrl}`);
      
      // Check if we're redirected to login page
      if (updatedUrl.includes('/ab/account-security/login')) {
        logger.warn('❌ Redirected to login page, need to handle authentication');
        logger.info('Since we bypassed processPendingUsers, we need to implement login logic here');
        logger.info('For now, exiting as authentication is required for job crawling');
        return { pagesVisited, jobsCollected, uniqueJobIds, failures };
      }
      
      // Check if we're on the most recent page
      if (updatedUrl.includes('/nx/find-work/most-recent')) {
        logger.info('✅ Successfully navigated to Most Recent page');
        
        // Pause a bit as requested
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Initialize job collection
        const allJobs: any[] = [];
        
        logger.info('Starting job scraping process...');
        
        // Process each page with retry logic and jitter delays
        for (let pageNum = 1; pageNum <= pages; pageNum++) {
          logger.info(`Processing page ${pageNum}/${pages}`);
          
          let pageSuccess = false;
          let retryCount = 0;
          const maxRetries = 3;
          
          while (!pageSuccess && retryCount < maxRetries) {
            try {
              // Wait for job tiles to load with timeout
              await page.waitForSelector('[data-test="job-tile-list"]', { timeout: 15000 });
              
              // Add jitter delay (1-3 seconds)
              const jitterDelay = 1000 + Math.random() * 2000;
              await new Promise(resolve => setTimeout(resolve, jitterDelay));
              
              // Extract job data from current page
              const pageJobs = await extractJobsFromPage(page, pageNum);
              logger.info(`Extracted ${pageJobs.length} jobs from page ${pageNum}`);
              
                          // Add jobs to collection and track unique IDs (deduplicate by jobId)
            for (const job of pageJobs) {
              if (job.jobId && !uniqueJobIds.has(job.jobId)) {
                uniqueJobIds.add(job.jobId);
                allJobs.push(job);
              } else if (!job.jobId) {
                // If no jobId, still add it but log a warning
                logger.warn(`Job without jobId found: ${job.title}`);
                allJobs.push(job);
              } else {
                logger.info(`Skipping duplicate job: ${job.jobId} - ${job.title}`);
              }
            }
              
              jobsCollected = allJobs.length;
              pagesVisited = pageNum;
              
              // Save jobs after each page (incremental save)
              await saveJobsToFile(allJobs, outputFile);
              logger.info(`Saved ${allJobs.length} total jobs to ${outputFile}`);
              
              pageSuccess = true;
              
            } catch (error) {
              retryCount++;
              const errorMessage = error instanceof Error ? error.message : String(error);
              logger.error(error, `Error processing page ${pageNum} (attempt ${retryCount}/${maxRetries})`);
              
              if (retryCount >= maxRetries) {
                failures.push(`Failed to process page ${pageNum} after ${maxRetries} attempts: ${errorMessage}`);
                break;
              } else {
                // Wait before retry with exponential backoff
                const retryDelay = 2000 * Math.pow(2, retryCount - 1);
                logger.info(`Retrying page ${pageNum} in ${retryDelay}ms...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
              }
            }
          }
          
          // Look for Load More button for next page with retry logic
          if (pageNum < pages && pageSuccess) {
            let loadMoreSuccess = false;
            let loadMoreRetryCount = 0;
            const maxLoadMoreRetries = 3;
            
            while (!loadMoreSuccess && loadMoreRetryCount < maxLoadMoreRetries) {
              try {
                // Wait for the button to be available
                await page.waitForSelector('button[data-test="load-more-button"]', { timeout: 10000 });
                
                // Check if button is visible and clickable
                const loadMoreButton = await page.$('button[data-test="load-more-button"]');
                if (loadMoreButton) {
                  // Check if button is visible and not disabled
                  const isVisible = await loadMoreButton.isVisible();
                  const isDisabled = await loadMoreButton.evaluate((btn: any) => btn.disabled);
                  
                  if (isVisible && !isDisabled) {
                    logger.info(`Clicking Load More Jobs button to load page ${pageNum + 1} (attempt ${loadMoreRetryCount + 1})`);
                    
                    // Get button text to verify it's the right button
                    const buttonText = await loadMoreButton.evaluate((btn: any) => btn.textContent?.trim());
                    logger.info(`Button text: "${buttonText}"`);
                    
                    if (!buttonText?.toLowerCase().includes('load more')) {
                      logger.warn(`Button text doesn't contain "load more": "${buttonText}"`);
                      loadMoreRetryCount++;
                      continue;
                    }
                    
                    // Scroll to button to ensure it's in view
                    await loadMoreButton.scrollIntoView();
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    // Use JavaScript click to avoid any interference
                    await page.evaluate((btn: any) => {
                      btn.click();
                    }, loadMoreButton);
                    
                    // Wait for new content to load
                    const loadDelay = 3000 + Math.random() * 2000;
                    logger.info(`Waiting ${loadDelay}ms for new content to load...`);
                    await new Promise(resolve => setTimeout(resolve, loadDelay));
                    
                    // Verify that new content was loaded by checking if job count increased
                    const newJobTiles = await page.$$('[data-test="job-tile-list"] section[data-ev-sublocation="job_feed_tile"], [data-test="job-tile-list"] section.air3-card-section');
                    logger.info(`Found ${newJobTiles.length} job tiles after clicking Load More`);
                    
                    loadMoreSuccess = true;
                  } else {
                    logger.warn(`Load More button not clickable: visible=${isVisible}, disabled=${isDisabled}`);
                    loadMoreRetryCount++;
                  }
                } else {
                  logger.info('No more Load More Jobs button found, reached end of available jobs');
                  break;
                }
                
              } catch (error) {
                loadMoreRetryCount++;
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger.error(error, `Error clicking Load More button (attempt ${loadMoreRetryCount}/${maxLoadMoreRetries}): ${errorMessage}`);
                
                if (loadMoreRetryCount >= maxLoadMoreRetries) {
                  failures.push(`Failed to click Load More button after ${maxLoadMoreRetries} attempts: ${errorMessage}`);
                  break;
                } else {
                  // Wait before retry with exponential backoff
                  const retryDelay = 2000 * Math.pow(2, loadMoreRetryCount - 1);
                  logger.info(`Retrying Load More button click in ${retryDelay}ms...`);
                  await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
              }
            }
            
            if (!loadMoreSuccess && loadMoreRetryCount >= maxLoadMoreRetries) {
              logger.warn(`Failed to load more jobs after ${maxLoadMoreRetries} attempts, stopping pagination`);
              break;
            }
          }
        }
        
        logger.info(`Job crawling completed. Total jobs collected: ${allJobs.length}`);
        
      } else {
        logger.warn(`❌ Unexpected URL after navigation: ${updatedUrl}`);
        failures.push(`Unexpected URL after navigation: ${updatedUrl}`);
      }
    } catch (error) {
      logger.error(error, 'Error navigating to Most Recent page');
      const errorMessage = error instanceof Error ? error.message : String(error);
      failures.push(`Navigation error: ${errorMessage}`);
      throw error;
    }
    
  } catch (error) {
    logger.error(error, 'Error during job crawling');
    const errorMessage = error instanceof Error ? error.message : String(error);
    failures.push(`General error: ${errorMessage}`);
    throw error;
  } finally {
    // Clean up the job crawler browser
    if (jobCrawlerBrowserManager) {
      try {
        await jobCrawlerBrowserManager.close();
      } catch (closeError) {
        logger.warn('Failed to close job crawler browser:', closeError);
      }
    }
  }
  
  return { pagesVisited, jobsCollected, uniqueJobIds, failures };
}

/**
 * Postprocess jobs file to convert postedAt fields to ISO format
 */
async function postprocessJobsFile(outputFile: string): Promise<void> {
  const fs = await import('fs');
  const path = await import('path');
  
  try {
    // Check if file exists
    if (!fs.existsSync(outputFile)) {
      logger.warn(`Output file ${outputFile} does not exist, skipping postprocessing`);
      return;
    }
    
    // Read the jobs file
    const fileContent = fs.readFileSync(outputFile, 'utf8');
    if (!fileContent.trim()) {
      logger.warn(`Output file ${outputFile} is empty, skipping postprocessing`);
      return;
    }
    
    // Parse JSONL format (one job per line)
    const lines = fileContent.trim().split('\n').filter(line => line.trim());
    const jobs = lines.map(line => {
      try {
        return JSON.parse(line);
      } catch (error) {
        logger.warn(`Failed to parse job line: ${line.substring(0, 100)}...`);
        return null;
      }
    }).filter(Boolean);
    
    if (jobs.length === 0) {
      logger.warn('No valid jobs found for postprocessing');
      return;
    }
    
    logger.info(`Processing ${jobs.length} jobs for postedAt conversion...`);
    
    // Process each job
    let processedCount = 0;
    const processedJobs = jobs.map(job => {
      if (job.postedAt && job.extractedAt) {
        const convertedPostedAt = convertPostedAtToISO(job.postedAt, job.extractedAt);
        if (convertedPostedAt) {
          job.postedAt = convertedPostedAt;
          processedCount++;
        }
      }
      return job;
    });
    
    // Write back to file
    const jsonlContent = processedJobs.map(job => JSON.stringify(job)).join('\n');
    fs.writeFileSync(outputFile, jsonlContent, 'utf8');
    
    logger.info(`Postprocessing completed: ${processedCount}/${jobs.length} jobs updated`);
    
  } catch (error) {
    logger.error(error, 'Failed to postprocess jobs file');
    throw error;
  }
}

/**
 * Convert postedAt field to ISO format based on extractedAt timestamp
 */
function convertPostedAtToISO(postedAt: string, extractedAt: string): string | null {
  try {
    const extractedDate = new Date(extractedAt);
    if (isNaN(extractedDate.getTime())) {
      logger.warn(`Invalid extractedAt date: ${extractedAt}`);
      return null;
    }
    
    const postedAtLower = postedAt.toLowerCase().trim();
    
    // Handle "X minutes ago", "X hours ago", "X days ago"
    if (postedAtLower.includes('minute')) {
      const minutes = parseInt(postedAt.match(/(\d+)/)?.[1] || '0');
      const resultDate = new Date(extractedDate.getTime() - (minutes * 60 * 1000));
      return resultDate.toISOString();
    }
    
    if (postedAtLower.includes('hour')) {
      const hours = parseInt(postedAt.match(/(\d+)/)?.[1] || '0');
      const resultDate = new Date(extractedDate.getTime() - (hours * 60 * 60 * 1000));
      return resultDate.toISOString();
    }
    
    if (postedAtLower.includes('day')) {
      const days = parseInt(postedAt.match(/(\d+)/)?.[1] || '0');
      const resultDate = new Date(extractedDate.getTime() - (days * 24 * 60 * 60 * 1000));
      return resultDate.toISOString();
    }
    
    // Handle "X weeks ago"
    if (postedAtLower.includes('week')) {
      const weeks = parseInt(postedAt.match(/(\d+)/)?.[1] || '0');
      const resultDate = new Date(extractedDate.getTime() - (weeks * 7 * 24 * 60 * 60 * 1000));
      return resultDate.toISOString();
    }
    
    // Handle "X months ago"
    if (postedAtLower.includes('month')) {
      const months = parseInt(postedAt.match(/(\d+)/)?.[1] || '0');
      const resultDate = new Date(extractedDate.getTime() - (months * 30 * 24 * 60 * 60 * 1000));
      return resultDate.toISOString();
    }
    
    // Handle "X years ago"
    if (postedAtLower.includes('year')) {
      const years = parseInt(postedAt.match(/(\d+)/)?.[1] || '0');
      const resultDate = new Date(extractedDate.getTime() - (years * 365 * 24 * 60 * 60 * 1000));
      return resultDate.toISOString();
    }
    
    // Handle "last week", "last month", etc.
    if (postedAtLower.includes('last week')) {
      const resultDate = new Date(extractedDate.getTime() - (7 * 24 * 60 * 60 * 1000));
      return resultDate.toISOString();
    }
    
    if (postedAtLower.includes('last month')) {
      const resultDate = new Date(extractedDate.getTime() - (30 * 24 * 60 * 60 * 1000));
      return resultDate.toISOString();
    }
    
    // Handle "today", "yesterday"
    if (postedAtLower.includes('today')) {
      const today = new Date(extractedDate);
      today.setHours(0, 0, 0, 0);
      return today.toISOString();
    }
    
    if (postedAtLower.includes('yesterday')) {
      const yesterday = new Date(extractedDate.getTime() - (24 * 60 * 60 * 1000));
      yesterday.setHours(0, 0, 0, 0);
      return yesterday.toISOString();
    }
    
    // Handle specific time formats like "2:30 PM", "14:30"
    const timeMatch = postedAt.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (timeMatch) {
      const hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2]);
      const ampm = timeMatch[3]?.toUpperCase();
      
      let adjustedHours = hours;
      if (ampm === 'PM' && hours !== 12) adjustedHours += 12;
      if (ampm === 'AM' && hours === 12) adjustedHours = 0;
      
      const resultDate = new Date(extractedDate);
      resultDate.setHours(adjustedHours, minutes, 0, 0);
      return resultDate.toISOString();
    }
    
    // If no pattern matches, return null (keep original)
    logger.debug(`No conversion pattern found for postedAt: ${postedAt}`);
    return null;
    
  } catch (error) {
    logger.warn(`Failed to convert postedAt "${postedAt}": ${error}`);
    return null;
  }
}

// Main execution for Task A
if (import.meta.url === `file://${process.argv[1]}`) {
  run(upworkJobCrawlerCmd, process.argv.slice(2));
}
