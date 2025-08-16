# Upwork Crawler - Sign-up Automation

A robust puppeteer-based sign-up automation tool for Upwork with PostgreSQL database integration.

## Features

- **Robust Browser Automation**: Uses puppeteer-extra with stealth plugins to avoid detection
- **PostgreSQL Database**: Stores user data and automation progress
- **Comprehensive Login Automation**: Complete Upwork login flow with error detection
- **Error Handling**: Comprehensive error tracking and retry mechanisms
- **Logging**: Structured logging with Pino
- **CLI Interface**: Easy-to-use command-line interface
- **Screenshot Capture**: Automatic screenshots for debugging
- **CSV Import**: Bulk user import with database-aligned headers

## Database Schema

The application uses a `users` table with the following structure:

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  country_code VARCHAR(10) NOT NULL,
  last_attempt_at TIMESTAMP,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error_code VARCHAR(100),
  last_error_message TEXT,
  success_at TIMESTAMP,
  captcha_flagged_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## Prerequisites

- Node.js 18+ 
- PostgreSQL database
- Chrome/Chromium browser

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd up-crawler
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
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

4. Create the database:
```sql
CREATE DATABASE up_crawler;
```

5. Run migrations:
```bash
npm run migrate
```

## Usage

### Build the project
```bash
npm run build
```

### Visit Login Page
Test the basic functionality by visiting the Upwork login page:

```bash
# Run in visible mode (default)
npm start visit-login

# Run in headless mode
npm start visit-login --headless

# Keep browser open indefinitely
npm start visit-login --keep-open
```

### Process Users with Full Login Automation
Run the complete login automation for pending users:

```bash
# Process 5 users (default)
npm start process-users

# Process specific number of users
npm start process-users --limit 1

# Run in headless mode
npm start process-users --headless
```

The automation includes:
- **Email Entry**: Navigate to login page, enter email, click Continue
- **Password Entry**: Enter password, click Login
- **Create Profile**: Click "Get Started" on profile creation page
- **Error Detection**: MFA, CAPTCHA, suspicious login, invalid credentials
- **Screenshots**: Captured at each major step for debugging
- **Human-like Behavior**: Random delays, realistic typing patterns

## Crawl Steps & Automation Workflow

The automation follows a step-by-step process that mimics human behavior while handling various scenarios and errors gracefully.

### Step 1: Browser Setup & Launch
**What happens:** The system prepares a browser that looks like a real user's computer
- Sets up a realistic desktop browser (Chrome on Windows)
- Configures the screen size to 1920x1080 pixels
- Applies stealth measures to avoid detection
- Adds a small random delay (1-2 seconds) to simulate human behavior

### Step 2: Navigate to Upwork Login Page
**What happens:** The browser goes to Upwork's login page and verifies it's the right place
- Opens `https://www.upwork.com/ab/account-security/login`
- Waits for the page to fully load (up to 30 seconds)
- Checks that the URL contains the expected login path
- If the wrong page loads, marks as error and stops

### Step 3: Enter Email Address
**What happens:** The system finds the email field and enters the user's email
- Looks for the email input field using multiple possible selectors
- If not found within 15 seconds, tries alternative field names
- Clears any existing text in the field
- Types the email character by character with random delays (50-150ms between each character)
- Takes a screenshot showing the filled email field
- Clicks the "Continue" button to proceed to password entry
- Waits for either the password field to appear or an error message

**Possible outcomes:**
- ✅ Success: Password field appears
- ❌ Error: "Invalid email" message → Marks as `INVALID_EMAIL`
- ❌ Error: Password field doesn't appear → Marks as `PASSWORD_FIELD_NOT_FOUND`

### Step 4: Enter Password
**What happens:** The system enters the password and attempts to log in
- Waits for the password input field to appear
- Clears any existing text in the field
- Types the password character by character (no logging of the actual password)
- Takes a screenshot showing the filled password field
- Clicks the "Log in" button
- Waits for one of several possible outcomes

**Possible outcomes:**
- ✅ Success: Redirected to create profile page
- ❌ Error: "Incorrect password" → Marks as `BAD_PASSWORD` (hard failure)
- ❌ Security: reCAPTCHA appears → Marks as `CAPTCHA` (soft failure)
- ❌ Security: MFA/OTP field appears → Marks as `MFA_REQUIRED` (soft failure)
- ❌ Security: Suspicious login page → Marks as `SUSPICIOUS_LOGIN` (soft failure)

### Step 5: Handle Post-Login Navigation
**What happens:** The system waits for the page to load and checks where it ended up
- Waits up to 15 seconds for the page to finish loading
- Checks if the URL contains `/nx/create-profile` (successful login)
- If successful, takes a screenshot of the create profile page
- If any security measures are detected, stops and reports the issue

### Step 6: Complete Profile Creation
**What happens:** The system completes the initial profile setup
- Takes a screenshot of the create profile page
- Looks for the "Get Started" button
- Clicks the button to proceed
- Waits for the page to navigate to the next step
- If successful, marks the user as fully processed

**Possible outcomes:**
- ✅ Success: Navigation completes → User marked as successful
- ❌ Error: "Get Started" button not found → Marks as `GET_STARTED_NOT_FOUND`

### Error Detection & Handling

The system continuously monitors for various security measures and errors:

#### Security Measures (Soft Failures - Can Retry Later):
- **reCAPTCHA Detection:** Looks for Google reCAPTCHA iframes or elements
- **MFA/OTP Detection:** Searches for verification code input fields
- **Suspicious Login Detection:** Scans page text for security-related keywords
- **Network Issues:** Handles timeouts and connection problems

#### Authentication Errors (Hard Failures - Don't Retry):
- **Invalid Email:** Email format or account doesn't exist
- **Bad Password:** Incorrect password for valid account
- **Account Issues:** Account suspended or locked

### Resilience Features

#### Smart Retry Logic:
- **Multiple Selector Attempts:** Tries different ways to find page elements
- **Fallback Strategies:** If one method fails, tries alternatives
- **Timeout Management:** Waits appropriate time for each step
- **Graceful Degradation:** Continues with partial success when possible

#### Human-like Behavior:
- **Random Delays:** Adds unpredictable timing between actions
- **Realistic Typing:** Types at human-like speeds with natural pauses
- **Natural Interactions:** Clicks, scrolls, and navigates like a real user
- **Error Recovery:** Handles temporary glitches and retries

### Screenshot Capture Strategy

The system takes screenshots at key moments for debugging and verification:

- **email_filled**: Shows the email field after typing, before clicking Continue
- **password_filled**: Shows the password field after typing, before clicking Login
- **after_login**: Shows the create profile page after successful login
- **create_profile**: Shows the final profile creation page
- **login-page**: Shows the initial login page for troubleshooting

### Result Tracking

Each automation attempt produces a detailed result:

**Success Example:**
```json
{
  "status": "success",
  "stage": "done",
  "screenshots": {
    "email_filled": "screenshots/email_filled-1234567890.png",
    "password_filled": "screenshots/password_filled-1234567890.png",
    "after_login": "screenshots/after_login-1234567890.png",
    "create_profile": "screenshots/create_profile-1234567890.png"
  },
  "url": "https://www.upwork.com/nx/create-profile/next-step"
}
```

**Error Example:**
```json
{
  "status": "soft_fail",
  "stage": "password",
  "error_code": "SUSPICIOUS_LOGIN",
  "screenshots": {
    "email_filled": "screenshots/email_filled-1234567890.png",
    "password_filled": "screenshots/password_filled-1234567890.png"
  },
  "url": "https://www.upwork.com/ab/account-security/login",
  "evidence": "Suspicious login indicators detected"
}
```

### Add Users
Add users to the database for automation:

```bash
npm start add-user \
  --first-name "John" \
  --last-name "Doe" \
  --email "john.doe@example.com" \
  --password "securepassword123" \
  --country-code "US"
```

### Import Users from CSV (Database-Aligned Headers)
Bulk-import users from a CSV/TSV file. The importer supports comma or tab delimiters and expects headers that match the database column names.

Required headers (case-insensitive):
- `first_name`
- `last_name`
- `email`
- `password`
- `country_code`

Optional headers:
- `attempt_count`
- `last_attempt_at` (ISO 8601 date/time)
- `last_error_code`
- `last_error_message`
- `success_at` (ISO 8601 date/time)
- `captcha_flagged_at` (ISO 8601 date/time)
- `location_street_address` (Street address for profile creation)
- `location_city` (City for profile creation)
- `location_state` (State/Province for profile creation)
- `location_post_code` (ZIP/Postal code for profile creation)

Command:
```bash
# Import users (skips existing)
npm start import-csv -- --file data/mock_users.csv

# Force import (updates existing users)
npm start import-csv -- --file data/mock_users.csv --force
```

Behavior:
- Skips rows missing any required fields
- Skips users whose `email` already exists (unless --force is used)
- If --force is used, updates existing users with new location data
- If optional fields are provided, they will be applied after user creation

Example (tab-delimited):
```
first_name	last_name	email	password	country_code	attempt_count	last_attempt_at	last_error_code	last_error_message	success_at	captcha_flagged_at	location_street_address	location_city	location_state	location_post_code
Zoe	Bennett	zoe.bennet03@outlook.com	workhard2025!	SG	0												12 Orchard Road	Singapore	Central	238832
```

### Process Users
Run the automation for pending users:

```bash
# Process 5 users (default)
npm start process-users

# Process specific number of users
npm start process-users --limit 1

# Run in headless mode
npm start process-users --headless
```

### View Statistics
Check the current status:

```bash
npm start stats
```

## Development

### Run in development mode
```bash
npm run dev visit-login
```

### Linting
```bash
npm run lint
```

### Testing
```bash
npm test
```

## Project Structure

```
src/
├── browser/
│   ├── browserManager.ts    # Browser lifecycle management
│   └── puppeteer.ts         # Puppeteer configuration
├── database/
│   ├── connection.ts        # Database connection
│   ├── migrate.ts           # Migration runner
│   └── migrations/          # Database migrations
├── services/
│   ├── userService.ts       # User database operations
│   ├── upworkService.ts     # Upwork automation logic
│   └── loginAutomation.ts   # Complete login flow automation
├── commands/
│   └── importCsv.ts         # CSV import functionality
├── utils/
│   ├── logger.ts            # Logging utility
│   └── csv.ts               # CSV parsing utilities
├── types/
│   └── database.ts          # Database types and interfaces
├── utils/
│   └── logger.ts            # Logging utility
├── main.ts                  # CLI entry point
└── migrate.ts               # Migration script
```

## Configuration

### Environment Variables

- `DATABASE_URL`: PostgreSQL connection string
- `LOG_LEVEL`: Logging level (debug, info, warn, error)
- `PUPPETEER_HEADLESS`: Run browser in headless mode (true/false)
- `PUPPETEER_TIMEOUT`: Browser timeout in milliseconds
- `PUPPETEER_USER_DATA_DIR`: Chrome user data directory
- `UPWORK_LOGIN_URL`: Upwork login page URL

### Browser Configuration

The browser is configured with stealth plugins to avoid detection:
- User agent spoofing
- WebDriver detection evasion
- Plugin and language spoofing
- Hardware concurrency spoofing
- And many more anti-detection measures

## Error Handling

The application tracks various error types:

### Login Automation Errors:
- `SUSPICIOUS_LOGIN`: Security verification required
- `MFA_REQUIRED`: Multi-factor authentication detected
- `CAPTCHA`: reCAPTCHA or other challenge detected
- `BAD_PASSWORD`: Incorrect password
- `INVALID_EMAIL`: Email validation failed
- `EMAIL_FIELD_NOT_FOUND`: Login form not found
- `PASSWORD_FIELD_NOT_FOUND`: Password form not found
- `GET_STARTED_NOT_FOUND`: Create profile button not found

### General Errors:
- `LOGIN_PAGE_FAILED`: Unable to reach login page
- `PROCESSING_ERROR`: General processing errors
- `NETWORK`: Network connectivity issues
- Database connection errors
- Browser launch failures

## Screenshots

Screenshots are automatically saved to the `./screenshots/` directory for debugging purposes:

- `email_filled-*.png`: After email entry
- `password_filled-*.png`: After password entry  
- `after_login-*.png`: After successful login
- `create_profile-*.png`: Create profile page
- `login-page-*.png`: Initial login page visit

## Security Considerations

- Passwords are stored in plain text (consider encryption for production)
- User data should be handled securely
- Consider rate limiting to avoid IP blocking
- Use proxies for production use
- The automation includes anti-detection measures but may still trigger security systems
- Monitor for account suspensions and adjust automation patterns accordingly

## Disclaimer

This tool is for educational and research purposes only. Users are responsible for ensuring compliance with Upwork's terms of service and applicable laws. The authors are not responsible for any misuse of this software.
