import type { Page } from 'puppeteer';
import type { JobData, JobSummary, JobTile } from '../types/job.js';
import { JobParser } from './jobParser.js';
import { getLogger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';

const logger = getLogger(import.meta.url);

export interface CrawlOptions {
  maxPages: number;
  outputFile: string;
  delayBetweenPages: number;
  retryAttempts: number;
  jitterDelay: number;
}

export class JobCrawler {
  private page: Page;
  private options: CrawlOptions;
  private collectedJobs: Map<string, JobData> = new Map();
  private failures: string[] = [];
  private startTime: number;

  constructor(page: Page, options: CrawlOptions) {
    this.page = page;
    this.options = options;
    this.startTime = Date.now();
  }

  /**
   * Main crawl method that navigates through pages and collects jobs
   */
  async crawl(): Promise<JobSummary> {
    logger.info({ maxPages: this.options.maxPages }, 'Starting job crawl');

    try {
      for (let pageNum = 1; pageNum <= this.options.maxPages; pageNum++) {
        logger.info({ pageNum }, 'Processing page');
        
        const success = await this.processPage(pageNum);
        if (!success) {
          this.failures.push(`Failed to process page ${pageNum}`);
          logger.warn({ pageNum }, 'Failed to process page, continuing...');
        }

        // Add delay between pages with jitter
        if (pageNum < this.options.maxPages) {
          const delay = this.options.delayBetweenPages + Math.random() * this.options.jitterDelay;
          await this.sleep(delay);
        }
      }

      // Save collected jobs
      await this.saveJobs();

      const summary = this.generateSummary();
      logger.info(summary, 'Crawl completed');
      return summary;

    } catch (error) {
      logger.error({ error }, 'Crawl failed');
      throw error;
    }
  }

  /**
   * Process a single page and extract job tiles
   */
  private async processPage(pageNum: number): Promise<boolean> {
    try {
      // Navigate to the page if not on first page
      if (pageNum > 1) {
        const success = await this.navigateToPage(pageNum);
        if (!success) return false;
      }

      // Wait for job tiles to load
      await this.waitForJobTiles();

      // Extract job tiles from the page
      const tiles = await this.extractJobTiles();
      logger.info({ pageNum, tileCount: tiles.length }, 'Extracted job tiles');

      // Parse tiles into structured data
      for (const tile of tiles) {
        const jobData = JobParser.parseJobTile(tile, pageNum);
        if (jobData && !this.collectedJobs.has(jobData.jobId)) {
          this.collectedJobs.set(jobData.jobId, jobData);
        }
      }

      return true;

    } catch (error) {
      logger.error({ error, pageNum }, 'Failed to process page');
      return false;
    }
  }

  /**
   * Navigate to a specific page number
   */
  private async navigateToPage(pageNum: number): Promise<boolean> {
    try {
      // Try to find and click the next page button
      const nextButton = await this.page.$('[data-test="pagination-next"]');
      if (!nextButton) {
        logger.warn({ pageNum }, 'No next page button found');
        return false;
      }

      await nextButton.click();
      await this.sleep(1000); // Wait for page load
      
      // Verify we're on the correct page
      const currentPage = await this.getCurrentPageNumber();
      if (currentPage !== pageNum) {
        logger.warn({ expected: pageNum, actual: currentPage }, 'Page navigation failed');
        return false;
      }

      return true;

    } catch (error) {
      logger.error({ error, pageNum }, 'Failed to navigate to page');
      return false;
    }
  }

  /**
   * Get the current page number from the pagination
   */
  private async getCurrentPageNumber(): Promise<number> {
    try {
      const pageElement = await this.page.$('[data-test="pagination-current"]');
      if (!pageElement) return 1;

      const pageText = await pageElement.evaluate(el => el.textContent);
      return parseInt(pageText || '1', 10);
    } catch {
      return 1;
    }
  }

  /**
   * Wait for job tiles to load on the page
   */
  private async waitForJobTiles(): Promise<void> {
    const selectors = [
      '[data-test="job-tile-list"]',
      '[data-test="job-tile"]',
      'section[data-test*="job"]',
    ];

    await this.page.waitForSelector(selectors[0], { timeout: 30000 });
    await this.sleep(1000); // Additional wait for dynamic content
  }

  /**
   * Extract job tiles from the current page
   */
  private async extractJobTiles(): Promise<JobTile[]> {
    return await this.page.evaluate(() => {
      const list = document.querySelector('div[data-test="job-tile-list"]');
      if (!list) return [];

      const sections = Array.from(list.querySelectorAll('section[data-ev-sublocation="job_feed_tile"], section.air3-card-section'));
      return sections.map((sec, i) => {
        const titleA = sec.querySelector('h3 a') as HTMLAnchorElement | null;
        const posted = (sec.querySelector('[data-test="posted-on"]') as HTMLElement | null)?.innerText?.trim() || null;

        // Try to infer a job id
        const href = titleA?.getAttribute('href') || null;
        let jobId: string | null = null;
        if (href) {
          const idMatch = href.match(/_~0([0-9a-z]+)\//i) || href.match(/_~([0-9a-z]+)/i);
          jobId = idMatch?.[1] ? `~0${idMatch[1]}` : null;
        }

        return {
          index: i,
          jobId,
          title: titleA?.textContent?.trim() || null,
          href,
          posted,
          rawHtml: sec.outerHTML,
        };
      });
    });
  }

  /**
   * Save collected jobs to JSONL file
   */
  private async saveJobs(): Promise<void> {
    const outputDir = path.dirname(this.options.outputFile);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const jobs = Array.from(this.collectedJobs.values());
    const lines = jobs.map(job => JSON.stringify(job));
    
    fs.writeFileSync(this.options.outputFile, lines.join('\n'), 'utf8');
    logger.info({ file: this.options.outputFile, count: jobs.length }, 'Saved jobs to file');
  }

  /**
   * Generate summary statistics
   */
  private generateSummary(): JobSummary {
    const durationMs = Date.now() - this.startTime;
    
    return {
      pagesVisited: this.options.maxPages,
      jobsCollected: this.collectedJobs.size,
      uniqueJobIds: this.collectedJobs.size,
      durationMs,
      failures: this.failures,
    };
  }

  /**
   * Utility method for sleeping
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
