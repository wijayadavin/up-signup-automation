import type { JobData, JobTile } from '../types/job.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger(import.meta.url);

export class JobParser {
  /**
   * Parse raw job tile HTML into structured JobData
   */
  static parseJobTile(tile: JobTile, pageNumber: number): JobData | null {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(tile.rawHtml, 'text/html');
      
      // Extract basic info
      const jobId = tile.jobId || this.extractJobIdFromHref(tile.href);
      const title = tile.title || this.extractTitle(doc);
      const url = this.buildFullUrl(tile.href);
      const description = this.extractDescription(doc);
      const skills = this.extractSkills(doc);
      const projectType = this.extractProjectType(doc);
      const experienceLevel = this.extractExperienceLevel(doc);
      const budget = this.extractBudget(doc);
      const hourly = this.extractHourly(doc);
      const postedAt = this.parsePostedTime(tile.posted);
      const connectsRequired = this.extractConnectsRequired(doc);
      const client = this.extractClientInfo(doc);

      if (!jobId || !title) {
        logger.warn({ jobId, title }, 'Missing required job data');
        return null;
      }

      return {
        jobId,
        title,
        url,
        description,
        skills,
        projectType,
        experienceLevel,
        budget,
        hourly,
        postedAt,
        connectsRequired,
        client,
        pageNumber,
      };
    } catch (error) {
      logger.error({ error, tile }, 'Failed to parse job tile');
      return null;
    }
  }

  private static extractJobIdFromHref(href: string | null): string | null {
    if (!href) return null;
    const idMatch = href.match(/_~0([0-9a-z]+)\//i) || href.match(/_~([0-9a-z]+)/i);
    return idMatch?.[1] ? `~0${idMatch[1]}` : null;
  }

  private static extractTitle(doc: Document): string | null {
    const titleEl = doc.querySelector('h3 a') as HTMLAnchorElement | null;
    return titleEl?.textContent?.trim() || null;
  }

  private static buildFullUrl(href: string | null): string {
    if (!href) return '';
    return href.startsWith('http') ? href : `https://www.upwork.com${href}`;
  }

  private static extractDescription(doc: Document): string {
    const descEl = doc.querySelector('[data-test="job-description-text"]');
    return descEl?.textContent?.trim() || '';
  }

  private static extractSkills(doc: Document): string[] {
    const skillEls = doc.querySelectorAll('[data-test="attr-item"]');
    return Array.from(skillEls).map(el => el.textContent?.trim()).filter(Boolean) as string[];
  }

  private static extractProjectType(doc: Document): 'fixed' | 'hourly' {
    const typeEl = doc.querySelector('[data-test="job-type"]');
    const typeText = typeEl?.textContent?.toLowerCase() || '';
    return typeText.includes('fixed') ? 'fixed' : 'hourly';
  }

  private static extractExperienceLevel(doc: Document): string {
    const levelEl = doc.querySelector('[data-test="contractor-tier"]');
    return levelEl?.textContent?.trim() || '';
  }

  private static extractBudget(doc: Document): { amount: number; currency: string } | undefined {
    const budgetEl = doc.querySelector('[data-test="budget"]');
    if (!budgetEl) return undefined;
    
    const budgetText = budgetEl.textContent?.trim() || '';
    const match = budgetText.match(/\$(\d+(?:,\d+)?)/);
    if (!match) return undefined;
    
    const amount = parseInt(match[1].replace(',', ''), 10);
    return { amount, currency: 'USD' };
  }

  private static extractHourly(doc: Document): { min: number; max: number; currency: string } | undefined {
    const typeEl = doc.querySelector('[data-test="job-type"]');
    const typeText = typeEl?.textContent || '';
    
    if (!typeText.includes('Hourly:')) return undefined;
    
    const match = typeText.match(/\$(\d+)-(\d+)/);
    if (!match) return undefined;
    
    return {
      min: parseInt(match[1], 10),
      max: parseInt(match[2], 10),
      currency: 'USD'
    };
  }

  private static parsePostedTime(posted: string | null): string {
    if (!posted) return new Date().toISOString();
    
    // Convert relative time to absolute
    const now = new Date();
    const postedLower = posted.toLowerCase();
    
    if (postedLower.includes('minute')) {
      const minutes = parseInt(posted.match(/(\d+)/)?.[1] || '1', 10);
      return new Date(now.getTime() - minutes * 60 * 1000).toISOString();
    }
    
    if (postedLower.includes('hour')) {
      const hours = parseInt(posted.match(/(\d+)/)?.[1] || '1', 10);
      return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
    }
    
    if (postedLower.includes('day')) {
      const days = parseInt(posted.match(/(\d+)/)?.[1] || '1', 10);
      return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
    }
    
    return now.toISOString();
  }

  private static extractConnectsRequired(doc: Document): number | undefined {
    // This field might not be visible in the tile view
    return undefined;
  }

  private static extractClientInfo(doc: Document): {
    country: string;
    paymentVerified: boolean;
    rating: number;
    totalSpent: string;
    hires: number;
    jobsPosted: number;
  } {
    const countryEl = doc.querySelector('[data-test="client-country"]');
    const country = countryEl?.textContent?.trim() || '';
    
    const verifiedEl = doc.querySelector('[data-test="payment-verification-status"]');
    const paymentVerified = verifiedEl?.textContent?.includes('verified') || false;
    
    const ratingEl = doc.querySelector('.air3-rating-foreground');
    const rating = this.extractRating(ratingEl);
    
    const spentEl = doc.querySelector('[data-test="formatted-amount"]');
    const totalSpent = spentEl?.textContent?.trim() || '$0';
    
    // These fields might not be available in tile view
    const hires = 0;
    const jobsPosted = 0;
    
    return {
      country,
      paymentVerified,
      rating,
      totalSpent,
      hires,
      jobsPosted,
    };
  }

  private static extractRating(ratingEl: Element | null): number {
    if (!ratingEl) return 0;
    
    const style = ratingEl.getAttribute('style');
    if (!style) return 0;
    
    const widthMatch = style.match(/width:\s*(\d+)px/);
    if (!widthMatch) return 0;
    
    const width = parseInt(widthMatch[1], 10);
    // Assuming 78px = 5.0 stars (based on the HTML structure)
    return Math.round((width / 78) * 5 * 10) / 10;
  }
}

// Browser-compatible DOMParser for Node.js
class DOMParser {
  parseFromString(html: string, mimeType: string): Document {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM(html, { mimeType });
    return dom.window.document;
  }
}
