# Quick Start Guide

## Prerequisites

- Node.js 18+
- PostgreSQL database
- Chrome/Chromium browser

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the project:**
   ```bash
   npm run build
   ```

3. **Set up environment:**
   ```bash
   cp env.example .env
   ```
   
   Edit `.env` with your database configuration:
   ```env
   DATABASE_URL=postgresql://username:password@localhost:5432/up_crawler
   LOG_LEVEL=info
   PUPPETEER_HEADLESS=false
   PUPPETEER_TIMEOUT=30000
   PUPPETEER_USER_DATA_DIR=./user-data
   UPWORK_LOGIN_URL=https://www.upwork.com/ab/account-security/login
   ```

4. **Create database:**
   ```sql
   CREATE DATABASE up_crawler;
   ```

5. **Run migrations:**
   ```bash
   npm run migrate
   ```

## Test the Login Page Visit

The first task is to visit the Upwork login page:

```bash
# Run in visible mode (see the browser)
npm start visit-login

# Run in headless mode
npm start visit-login --headless
```

This will:
- Launch a browser with stealth plugins
- Navigate to https://www.upwork.com/ab/account-security/login
- Take a screenshot for verification
- Log the results

## Add Test Users

```bash
npm start add-user \
  --first-name "John" \
  --last-name "Doe" \
  --email "john.doe@example.com" \
  --password "securepassword123" \
  --country-code "US"
```

## View Statistics

```bash
npm start stats
```

## Available Commands

- `visit-login` - Visit the Upwork login page
- `add-user` - Add a new user to the database
- `process-users` - Process pending users for automation
- `stats` - Show application statistics

## Project Structure

```
src/
├── browser/           # Browser automation
├── database/          # Database operations
├── services/          # Business logic
├── types/            # TypeScript types
├── utils/            # Utilities
└── main.ts           # CLI entry point
```

## Features Implemented

✅ **Robust Browser Automation**
- Puppeteer with stealth plugins
- Anti-detection measures
- Screenshot capture

✅ **PostgreSQL Database**
- User management
- Attempt tracking
- Error logging

✅ **CLI Interface**
- Easy-to-use commands
- Configuration options

✅ **Logging & Monitoring**
- Structured logging with Pino
- Error tracking
- Statistics

## Next Steps

1. Test the login page visit
2. Add users to the database
3. Implement full sign-up automation
4. Add proxy support
5. Implement captcha handling

## Troubleshooting

- **Database connection errors**: Check your DATABASE_URL in .env
- **Browser launch issues**: Ensure Chrome/Chromium is installed
- **Permission errors**: Check file permissions for user-data directory
