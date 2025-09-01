// src/upwork.ts
import { BrowserManager } from './browser/browserManager.js';
import { UserService } from './services/userService.js';
import { getLogger } from './utils/logger.js';
import type { Page } from 'puppeteer';
import path from 'path';
import fs from 'fs';

const logger = getLogger(import.meta.url);
const FEED_URL = 'https://www.upwork.com/nx/find-work/most-recent';
const OUT_DIR = path.resolve('out');
const sleep = (ms: number) => new Promise<void>(res => setTimeout(res, ms));

type RunOpts = {
  userId: number;
  headless?: boolean;
  noStealth?: boolean;
  restoreSession?: boolean;
  keepOpen?: boolean;
};

export async function runUpwork(opts: RunOpts) {
  const {
    userId,
    headless = false,
    noStealth = false,
    restoreSession = true,
    keepOpen = false,
  } = opts;

  const userService = new UserService();
  const user = await userService.getUserById(userId);
  if (!user) throw new Error(`User ${userId} not found`);

  const browser = new BrowserManager({
    headless,
    disableTrackingProtection: noStealth,
    user,
  });

  let page: Page | null = null;

  try {
    page = await browser.newPage();
    await browser.clearBrowserState(page);

    // Fast path: try to restore session
    if (restoreSession) {
      logger.info('Trying session restore -> feed');
      await page.goto(FEED_URL, { waitUntil: 'networkidle2', timeout: 60000 });
      await tryDismissBanners(page);

      if (await isLoggedIn(page)) {
        logger.info('Session restore worked. On feed ✅');
        await waitForFeed(page);
        if (keepOpen) await waitForever();
        return;
      }
      logger.info('No valid session; proceeding to login.');
    }

    // Navigate to login
    await page.goto('https://www.upwork.com/ab/account-security/login', {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });
    await tryDismissBanners(page);

    // Email
    const emailSel = 'input[name="login[username]"], #login_username';
    await page.waitForSelector(emailSel, { timeout: 30000 });
    await page.click(emailSel, { clickCount: 3 });
    await page.type(emailSel, user.email, { delay: 40 });

    // Continue
    const contSel =
      'button[type="submit"], button[data-qa="login-btn"], button#login_control_continue';
    await safeClick(page, contSel);

    // Password
    const passSel = 'input[name="login[password]"], #login_password';
    await page.waitForSelector(passSel, { timeout: 30000 });
    await page.type(passSel, user.password, { delay: 40 });

    // Submit
    await safeClick(page, contSel);

    // Wait for redirect
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
    await tryDismissBanners(page);

    if (!(await isLoggedIn(page))) {
      throw new Error('Login did not complete (still unauthenticated).');
    }

    logger.info('Login OK ✅  Navigating to Most Recent feed...');
    await page.goto(FEED_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await tryDismissBanners(page);
    await waitForFeed(page);

    await dumpFeedHtml(page);  // full HTML snapshot
    await dumpTiles(page);     // per-tile raw HTML

    // TODO:
    // Summary JSON printed to stdout:
    // {
    //   "pagesVisited": 25,
    //   "jobsCollected": 1245,
    //   "uniqueJobIds": 1245,
    //   "durationMs": 123456,
    //   "failures": []
    // }
    // Minimum fields per job
    // jobId, title, url, description
    // skills[] (tags), projectType (fixed/hourly), experienceLevel
    // budget or hourly.min/max + currency
    // postedAt (ISO), connectsRequired (if visible)
    // client: { country, paymentVerified, rating, totalSpent, hires, jobsPosted }
    // pageNumber

    if (keepOpen) await waitForever();
  } finally {
    if (page && !keepOpen) {
      try { await page.close(); } catch {}
    }
    if (!keepOpen) {
      await browser.close();
    }
  }
}

// ---------- scraping / saving ----------
async function dumpFeedHtml(page: Page) {
  try {
    ensureOutDir();
    const html = await page.content();
    const stamp = timeStamp();
    const file = path.join(OUT_DIR, `feed-${stamp}.html`);
    fs.writeFileSync(file, html, 'utf8');
    logger.info({ file }, 'Saved full feed HTML');
  } catch (e) {
    logger.warn({ e }, 'Failed to save full feed HTML');
  }
}

async function dumpTiles(page: Page) {
  ensureOutDir();
  const jobsJsonl = path.join(OUT_DIR, 'jobs.jsonl');

  // Evaluate in-page to capture raw tile HTML plus a few basics
  const tiles = await page.evaluate(() => {
    const list = document.querySelector('div[data-test="job-tile-list"]');
    if (!list) return [];

    // Each tile is a <section ...> inside the list
    const sections = Array.from(list.querySelectorAll('section[data-ev-sublocation="job_feed_tile"], section.air3-card-section'));
    return sections.map((sec, i) => {
      const titleA = sec.querySelector('h3 a') as HTMLAnchorElement | null;
      const posted = (sec.querySelector('[data-test="posted-on"]') as HTMLElement | null)?.innerText?.trim() || null;

      // Try to infer a job id (often inside the href, after _~0...?/ )
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
        rawHtml: sec.outerHTML, // <-- full tile HTML
      };
    });
  });

  if (!tiles.length) {
    logger.warn('No tiles found under [data-test="job-tile-list"]');
    return;
  }

  // Append to jobs.jsonl (one JSON object per line)
  const lines = tiles.map(t => JSON.stringify(t));
  fs.appendFileSync(jobsJsonl, lines.join('\n') + '\n', 'utf8');

  logger.info({ count: tiles.length, file: jobsJsonl }, 'Saved job tiles (raw HTML + basics)');
}

// ----- helpers -----
function ensureOutDir() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
}

function timeStamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    '-' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

async function isLoggedIn(page: Page): Promise<boolean> {
  const url = page.url();
  if (url.includes('/ab/account-security/login')) return false;

  const userMenu = await page.$('[data-qa="nav-user-menu"], [data-test="header-user-menu"]');
  const feedList = await page.$(
    '[data-test="job-tile-list"], [data-test="job-tile"], section[data-test*="job"]'
  );
  return Boolean(userMenu || feedList);
}

async function waitForFeed(page: Page) {
  const selectors = [
    '[data-test="job-tile-list"]',
    '[data-test="job-tile"]',
    'section[data-test*="job"]',
    'div[data-ev-label="job_list"]',
  ];
  await waitForAny(page, selectors, 60000);
  await sleep(1200);
}

async function waitForAny(page: Page, selectors: string[], timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    for (const sel of selectors) {
      const el = await page.$(sel);
      if (el) return;
    }
    await sleep(250);
  }
  throw new Error(`Timeout waiting for selectors: ${selectors.join(', ')}`);
}

async function safeClick(
  page: Page,
  selector: string,
  { attempts = 4, delay = 200 }: { attempts?: number; delay?: number } = {}
) {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const handle = await page.waitForSelector(selector, { visible: true, timeout: 5000 });
      if (!handle) throw new Error(`Selector not found: ${selector}`);
      await handle.evaluate((el: Element) =>
        (el as HTMLElement).scrollIntoView({ block: 'center', inline: 'center' })
      );
      await sleep(50);
      await handle.click({ delay: 10 });
      return;
    } catch (err) {
      lastErr = err;
      // Fallback: JS click
      try {
        const ok = await page.evaluate((sel) => {
          const el = document.querySelector(sel) as HTMLElement | null;
          if (!el) return false;
          el.scrollIntoView({ block: 'center', inline: 'center' });
          el.click();
          return true;
        }, selector);
        if (ok) return;
      } catch {}
      await sleep(delay + i * 100);
    }
  }
  throw new Error(`safeClick failed for "${selector}" after ${attempts} attempts: ${lastErr}`);
}

async function tryDismissBanners(page: Page) {
  const selectors = [
    '#onetrust-accept-btn-handler',
    'button#onetrust-accept-btn-handler',
    'button[aria-label="Accept cookies"]',
    '[data-test="close-button"]',
    'button[aria-label="Close"]',
  ];
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        await safeClick(page, sel, { attempts: 2 });
        await sleep(200);
      }
    } catch {
      /* ignore */
    }
  }
}

async function waitForever(): Promise<never> {
  // keep process alive (Ctrl+C to exit)
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  await new Promise<never>(() => {});
  throw new Error('unreachable');
}
