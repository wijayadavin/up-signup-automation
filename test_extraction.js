// Test script to verify hourly rate and budget extraction logic
import { JSDOM } from 'jsdom';

// Mock HTML that represents the job tiles from Upwork
const mockHtml = `
<div>
  <section data-ev-sublocation="job_feed_tile" data-ev-opening_uid="12345">
    <h3><a href="/jobs/test_~012345">Test Job 1</a></h3>
    <div data-test="job-description-text">Test description</div>
    <div data-test="attr-item">JavaScript</div>
    <div data-test="attr-item">React</div>
    <small class="text-light display-inline-block text-caption">
      <strong data-test="job-type">Hourly: $18-$32</strong>
      <span> - <span data-test="contractor-tier">Intermediate</span></span>
      <span> - <span>Est. Time: </span> <span data-test="duration">Less than 30 hrs/week</span></span>
    </small>
  </section>
  
  <section data-ev-sublocation="job_feed_tile" data-ev-opening_uid="67890">
    <h3><a href="/jobs/test2_~067890">Test Job 2</a></h3>
    <div data-test="job-description-text">Test description 2</div>
    <div data-test="attr-item">WordPress</div>
    <div data-test="attr-item">Web Design</div>
    <small class="text-light display-inline-block text-caption">
      <strong data-test="job-type">Fixed-price</strong>
      <span> - <span data-test="contractor-tier">Entry level</span></span>
      <span> - <span>Est. Budget: </span> <span data-test="budget">$20</span></span>
    </small>
  </section>
  
  <section data-ev-sublocation="job_feed_tile" data-ev-opening_uid="11111">
    <h3><a href="/jobs/test3_~011111">Test Job 3</a></h3>
    <div data-test="job-description-text">Test description 3</div>
    <div data-test="attr-item">Python</div>
    <div data-test="attr-item">Data Analysis</div>
    <small class="text-light display-inline-block text-caption">
      <strong data-test="job-type">Hourly: $25</strong>
      <span> - <span data-test="contractor-tier">Expert</span></span>
      <span> - <span>Est. Time: </span> <span data-test="duration">30+ hrs/week</span></span>
    </small>
  </section>
</div>
`;

// Function to extract job data (copied from the fixed upwork.ts)
function extractJobsFromPage(page, pageNum) {
  const dom = new JSDOM(page);
  const document = dom.window.document;
  
  const jobs = [];
  
  // Find all job tiles on the page
  let jobTiles = document.querySelectorAll('[data-test="job-tile-list"] section[data-ev-sublocation="job_feed_tile"]');
  
  // Fallback to alternative selector if the first one doesn't work
  if (jobTiles.length === 0) {
    const fallbackTiles = document.querySelectorAll('section[data-ev-sublocation="job_feed_tile"]');
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
        console.log(`DEBUG: Type text for hourly: "${typeText}"`);
        const hourlyMatch = typeText.match(/\$(\d+)-(\d+)/);
        console.log(`DEBUG: Hourly match result:`, hourlyMatch);
        if (hourlyMatch) {
          hourly = {
            min: parseInt(hourlyMatch[1], 10),
            max: parseInt(hourlyMatch[2], 10),
            currency: 'USD'
          };
          console.log(`DEBUG: Extracted hourly range: min=${hourly.min}, max=${hourly.max}`);
        } else {
          // Try to extract single hourly rate
          const singleHourlyMatch = typeText.match(/\$(\d+)/);
          console.log(`DEBUG: Single hourly match result:`, singleHourlyMatch);
          if (singleHourlyMatch) {
            const rate = parseInt(singleHourlyMatch[1], 10);
            hourly = {
              min: rate,
              max: rate,
              currency: 'USD'
            };
            console.log(`DEBUG: Extracted single hourly rate: ${rate}`);
          }
        }
      }
      
      // Extract experience level
      const experienceElement = tile.querySelector('[data-test="contractor-tier"]');
      const experienceLevel = experienceElement?.textContent?.trim() || '';
      
      // Extract duration/estimated time
      const durationElement = tile.querySelector('[data-test="duration"]');
      const duration = durationElement?.textContent?.trim() || '';
      
      // Create job object
      const job = {
        jobId,
        title,
        description,
        skills,
        projectType,
        experienceLevel,
        duration,
        budget,
        hourly,
        pageNumber: pageNum
      };
      
      if (jobId && title) {
        jobs.push(job);
      }
      
    } catch (error) {
      console.error('Error extracting job data:', error);
    }
  });
  
  return jobs;
}

// Test the extraction
console.log('Testing job extraction logic...\n');

const extractedJobs = extractJobsFromPage(mockHtml, 1);

console.log('Extracted jobs:');
extractedJobs.forEach((job, index) => {
  console.log(`\nJob ${index + 1}:`);
  console.log(`  Title: ${job.title}`);
  console.log(`  Project Type: ${job.projectType}`);
  console.log(`  Hourly: ${JSON.stringify(job.hourly)}`);
  console.log(`  Budget: ${JSON.stringify(job.budget)}`);
  console.log(`  Experience: ${job.experienceLevel}`);
  console.log(`  Duration: ${job.duration}`);
  console.log(`  Skills: ${job.skills.join(', ')}`);
});

console.log('\nTest completed!');
