
# 🧑‍💻 Browser Automation Engineer Test - Platform Team

Welcome!  
You will complete **two coding tasks** (45 minutes total).  
The goal is to evaluate your skills in **JavaScript, TypeScript, Puppeteer, selectors, and handling anti-bot challenges**.

---

## ⚙️ Setup Instructions
- Use **Node.js ≥ 18** and **TypeScript (strict mode)**.  
- Puppeteer/Playwright is required.  
- You may use small helper libraries.  
- Please structure your project cleanly and include a `README.md` with run instructions.  

Expected repo structure:
```
/src
  upwork.ts       # Task A entrypoint
  turnstile.ts    # Task B entrypoint
  lib/            # helpers (selectors, waiters, logging, etc.)
  types.ts        # shared types
/.env.example
package.json
tsconfig.json
```

NPM scripts:
```json
{
  "build": "tsc -p .",
  "start:upwork": "node dist/upwork.js --pages 25 --out out/jobs.json",
  "start:turnstile": "node dist/turnstile.js --out out/turnstile_results.json"
}
```

---

## 📝 Task A - Upwork Job List Crawler

**Goal:** From a given Upwork job search URL, crawl up to **25 pages** and extract job details.  

### Requirements
- **Single run:** one CLI command completes the crawl.  
- **Retry & stability:** implement waits, retries, jitter delays.  
- **Deduplication:** by job ID.  
- **Output:**  
  - `out/jobs.json` (one job per line).  
  - Summary JSON printed to stdout:
    ```json
    {
      "pagesVisited": 25,
      "jobsCollected": 1245,
      "uniqueJobIds": 1245,
      "durationMs": 123456,
      "failures": []
    }
    ```

### Minimum fields per job
- `jobId`, `title`, `url`, `description`  
- `skills[]` (tags), `projectType` (fixed/hourly), `experienceLevel`  
- `budget` or `hourly.min/max` + `currency`  
- `postedAt` (ISO), `connectsRequired` (if visible)  
- `client`: `{ country, paymentVerified, rating, totalSpent, hires, jobsPosted }`  
- `pageNumber`  

---

## 📝 Task B - Turnstile Demo Solver

**Goal:** In a single run, attempt to solve the Cloudflare Turnstile challenge **10 times in a row** for each demo URL.  

### 2captcha API Key
- a15794fb3ff5eaa7eef90604b543cf1a

### Demo URLs
- https://2captcha.com/demo/cloudflare-turnstile  
- https://2captcha.com/demo/cloudflare-turnstile-challenge  

### Requirements
- **One run:** covers all 2 sites × 10 attempts each (20 total).  
- **Sequential:** no parallel solves.  
- **Timeouts:** e.g., 90s per attempt; record failure reason.  
- **Success detection:** confirm by page state (e.g., success text).  
- **Configurable:** API keys, attempt count, timeout from `.env`.  

### Output
- Attempt log:
    ```json
    {
      "site": "nopecha.com/demo/cloudflare",
      "attempt": 3,
      "startedAt": "2025-09-01T10:15:00Z",
      "durationMs": 8000,
      "status": "success"
    }
    ```
- Summary per site:
    ```json
    { "attempts": 10, "successes": 8, "successRate": 0.8, "avgDurationMs": 9500 }
    ```
- Overall totals across all sites.  

---

## ✅ Submission
- Push your solution to a **GitHub repo** (private if preferred) and share access with us.  
- Make sure your README has clear run instructions.  
- Ensure code compiles and runs with `npm run build && npm start:upwork` / `npm start:turnstile`.

---

## ⚠️ Important Notes
- Clean, maintainable, and type-safe code is as important as correctness.

---

Good luck - we look forward to reviewing your solution! 🚀