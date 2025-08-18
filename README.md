# Upwork Crawler - Sign-up Automation

A robust puppeteer-based sign-up automation tool for Upwork with PostgreSQL database integration.

## Features

- **Robust Browser Automation**: Uses puppeteer-extra with stealth plugins to avoid detection
- **PostgreSQL Database**: Stores user data and automation progress with comprehensive tracking
- **Complete Profile Creation Workflow**: Full 15-step Upwork profile creation process:
  - **Pre-Onboarding Steps**: Welcome, experience selection, work goals, preferences
  - **Core Profile Steps**: Resume import, categories, skills, title, employment, education
  - **Final Steps**: Languages, overview, rate, location with phone verification
- **Real OTP Integration**: TextVerified.com API integration for phone verification
- **Smart Session Management**: Automatic session saving/restoration with error handling
- **Comprehensive Error Handling**: Captcha detection, network error recovery, graceful fallbacks
- **Human-like Behavior**: Random delays, realistic typing patterns, natural navigation
- **Robust Element Detection**: Multiple selector strategies with text-based fallbacks
- **Screenshot Capture**: Automatic debugging screenshots at each step
- **CSV Import/Export**: Bulk user management with database-aligned headers
- **Proxy Support**: Decodo residential proxy with user-specific port allocation
- **CLI Interface**: Intuitive command-line interface with extensive options

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
  up_created_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## Prerequisites

- Node.js 18+ 
- PostgreSQL database
- Chrome/Chromium browser
- **Google Chrome** (for headful mode with `--headful` flag)

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
cp .env.example .env
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

6. (Optional) Install Google Chrome for headful mode:
```bash
# For Ubuntu/Debian systems
wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" | sudo tee /etc/apt/sources.list.d/google-chrome.list
sudo apt update
sudo apt install google-chrome-stable -y

# For other systems, download from https://www.google.com/chrome/
```

## Usage

### Run docker compose
From the project root directory, run:
```bash
docker compose up -d
```


### Build the project
```bash
npm run build
```

### Available Commands

The application provides several commands for different operations:

- **`visit-login`**: Test basic functionality by visiting the Upwork login page
  - `--debug`: Check login status without performing login (for debugging)
  - `--headless`: Run browser in headless mode
  - `--keep-open`: Keep browser open indefinitely
- **`add-user`**: Add individual users to the database
- **`process-users`**: Run complete login automation for pending users
  - `--upload`: Enable upload mode for resume import step (handles file upload instead of manual form filling)
  - `--no-stealth`: Disable stealth mode for debugging (use normal browser behavior)
  - `--restore-session`: Restore existing session instead of starting from login
  - `--skip-otp`: Skip location step (except profile picture) and redirect to submit page
- **`stats`**: View application statistics and user status
- **`test-proxy`**: Test proxy configuration and verify IP details
- **`import-csv`**: Bulk import users from CSV/TSV files
- **`restore-session`**: Restore user session and open location page for manual completion
  - `--headful`: Run browser in headful mode using system Chrome for natural browsing
- **`wait-otp`**: Wait for OTP from TextVerified.com API
  - `--user-id <id>`: User ID to wait for OTP
  - `--timeout <seconds>`: Timeout in seconds (default: 50)

### Command Syntax

**Important**: When using `npm start` with command flags, you must use `--` to separate npm arguments from command arguments:

```bash
# Correct syntax:
npm start <command> -- <flags>

# Examples:
npm start visit-login -- --debug --headless
npm start process-users -- --limit 5 --headless
npm start process-users -- --upload --no-stealth
npm start process-users -- --restore-session --no-stealth
npm start process-users -- --skip-otp
npm start test-proxy -- --headless
npm start restore-session -- --user-id 1 --headful
npm start wait-otp -- --user-id 1 --timeout 60

# Incorrect syntax (flags won't be recognized):
npm start visit-login --debug --headless  # ❌ Wrong
```

**Alternative**: You can also run commands directly:
```bash
# Direct execution (no npm start needed):
node dist/main.js visit-login --debug --headless
node dist/main.js process-users --limit 5 --headless
node dist/main.js process-users --upload --no-stealth
node dist/main.js process-users --restore-session --no-stealth
node dist/main.js process-users --skip-otp
node dist/main.js restore-session --user-id 1 --headful
node dist/main.js wait-otp --user-id 1 --timeout 60
```

### Visit Login Page
Test the basic functionality by visiting the Upwork login page:

```bash
# Run in visible mode (default)
npm start visit-login

# Visit with specific user (uses user's proxy settings)
npm start visit-login -- --user-id 6

# Run in headless mode
npm start visit-login -- --headless

# Keep browser open indefinitely
npm start visit-login -- --keep-open

# Debug mode: check if already logged in without performing login
npm start visit-login -- --debug

# Debug mode with headless and keep open
npm start visit-login -- --debug --headless --keep-open

# Combine options: user-specific browser with keep-open
npm start visit-login -- --user-id 6 --keep-open
```

**User-Specific Features:**
- **Proxy Configuration**: When `--user-id` is provided, uses the user's specific proxy port
- **Session Management**: Browser manager is configured with user-specific settings
- **IP Tracking**: Logs current IP address with user context for debugging

**Debug Mode Features:**
- **Login Status Check**: Visits login page and checks if already authenticated
- **Automatic Redirect Detection**: Detects if redirected to create profile page (logged in)
- **Status Reporting Only**: Reports login status without performing automation
- **Screenshot Capture**: Saves screenshots for debugging:
  - `debug-already-logged-in-*.png`: When already logged in
  - `debug-not-logged-in-*.png`: When not logged in
  - `debug-unknown-page-*.png`: When on unexpected page
- **No Automation**: Use `process-users` command for actual login automation

### Test Resume Generation
Test the PDF resume generation functionality without browser automation:

```bash
# Generate resume for first available user
npm start test-resume

# Generate resume for specific user ID
npm start test-resume -- --user-id 1

# Generate resume for specific user email
npm start test-resume -- --email user@example.com

# Generate both PDF and plain text versions
npm start test-resume -- --plain-text

# Custom output directory
npm start test-resume -- --output ./my-resumes

# Complete example with all options
npm start test-resume -- --user-id 1 --plain-text --output ./test-output
```

**Features:**
- Generates ATS-friendly PDF resume using user data from database
- Optional plain text version for copy/paste scenarios
- File size validation (warns if too small/large for ATS)
- Customizable output directory
- Works with user ID, email, or first available user

### Process Users with Full Login Automation
Run the complete login automation for pending users:

```bash
# Process 5 users (default)
npm start process-users

# Process specific number of users
npm start process-users -- --limit 1

# Run in headless mode
npm start process-users -- --headless

# Test resume upload mode (handles file upload instead of manual form filling)
npm start process-users -- --upload

# Test resume upload in headless mode
npm start process-users -- --upload --headless

# Test resume upload with no-stealth mode for debugging
npm start process-users -- --upload --no-stealth
```

The automation includes:
- **Email Entry**: Navigate to login page, enter email, click Continue
- **Password Entry**: Enter password, click Login
- **Create Profile**: Click "Get Started" on profile creation page
- **Error Detection**: MFA, CAPTCHA, suspicious login, invalid credentials
- **Screenshots**: Captured at each major step for debugging
- **Human-like Behavior**: Random delays, realistic typing patterns

**No-Stealth Mode (`--no-stealth`)**:
- **Purpose**: Disable stealth mode for debugging and troubleshooting
- **Browser Behavior**: Uses normal browser settings without anti-detection measures
- **Use Cases**: Debug automation issues, test without stealth interference
- **When to Use**: When automation fails and you need to see normal browser behavior
- **Combination**: Can be used with `--upload` flag for focused debugging

**Restore-Session Mode (`--restore-session`)**:
- **Purpose**: Reuse existing saved sessions instead of performing fresh login
- **Session Management**: Automatically restores cookies, localStorage, and browser state
- **Session Persistence**: Automatically saves session state after successful login/restoration
- **Use Cases**: Continue automation from where it left off, avoid repeated logins
- **When to Use**: When users have existing sessions saved from previous runs
- **Fallback**: If session restoration fails, automatically falls back to normal login flow
- **Benefits**: Faster execution, reduced login attempts, better success rates, persistent sessions

**Skip-OTP Mode (`--skip-otp`)**:
- **Purpose**: Skip location step fields (except profile picture) and redirect directly to submit page
- **Location Step Behavior**: Only uploads profile picture, skips address/phone verification
- **Redirect**: Automatically navigates to `https://www.upwork.com/nx/create-profile/submit`
- **Use Cases**: Bypass phone verification, complete profile creation faster
- **When to Use**: When you want to skip the OTP verification process
- **Benefits**: Faster profile completion, no phone verification required

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

### Step 6: Complete Profile Creation Workflow
**What happens:** The system completes the comprehensive profile creation process through multiple steps

#### 6.1: Pre-onboarding
- Takes a screenshot of the create profile page
- Waits for navigation to complete

**Step 1: Welcome page**
- URL: `/nx/create-profile/welcome`
- Action: None
- Button: Click "Get started" to proceed
- Fallback: Direct URL navigation if button missing

**Step 2: Experience Selection**
- URL: `/nx/create-profile/experience`
- Action: Click "FREELANCED_BEFORE" radio button
- Button: Click "Next" to proceed
- Retry Logic: Up to 2 attempts with tab+enter fallback if direct click fails
- Fallback: Direct URL navigation if button missing

**Step 3: Work Goals**
- URL: `/nx/create-profile/goal`
- Action: Click "EXPLORING" radio button
- Button: Click "Next" to proceed
- Retry Logic: Up to 2 attempts with tab+enter fallback if direct click fails

**Step 4: Work Preferences**
- URL: `/nx/create-profile/work-preference`
- Action: If value not true yet, Click "TALENT_MARKETPLACE" checkbox (browse and bid for client jobs)
- Button: Click "Next" to proceed
- Retry Logic: Up to 2 attempts with tab+enter fallback (5 tabs) if direct click fails

#### 6.2: Profile Creation Onboarding
The automation follows this exact sequence through Upwork's profile creation flow.
### Complete Profile Creation Workflow

The automation handles the full 15-step Upwork profile creation process using comprehensive, battle-tested implementations from `src/services/loginAutomation.ts`:

#### **Pre-Onboarding Steps (1-4)**
**Step 1: Welcome Page**
- URL: `/nx/create-profile/welcome`
- If current path is correct, save current user.session_state. Else mark as failed.
- Action: Click "Get started" button to begin profile creation
- **Robust Detection**: Multiple selector strategies with fallback mechanisms

**Step 2: Experience Selection**
- URL: `/nx/create-profile/experience`
- Action: Select "FREELANCED_BEFORE" radio button
- **Verification**: Confirms selection and clicks "Next" with retry logic

**Step 3: Work Goals**
- URL: `/nx/create-profile/goal`
- Action: Select "EXPLORING" radio button for work opportunities
- **Consistent Handling**: Uses same robust radio button selection logic

**Step 4: Work Preferences**
- URL: `/nx/create-profile/work-preference`
- Action: Select "TALENT_MARKETPLACE" checkbox
- **Smart Selection**: Handles already-checked boxes by clicking twice to refresh
- **Fallback Navigation**: Uses 5 tab presses + enter for robust button clicking

#### **Core Profile Steps (5-11)**
**Step 5: Resume Import**
- URL: `/nx/create-profile/resume-import`
- If current path is correct, save current user.session_state. Else mark as failed.
- **Dual Mode Support**: Handles both manual and upload modes automatically
- **Manual Mode (Default - No `--upload` flag)**:
  - **"Fill out manually" Button**: Clicks "Fill out manually (15 min)" button once
- **Upload Mode (With `--upload` flag)**:
  - **PDF Generation**: Auto-generates ATS-friendly PDF using user data
  - **Direct Upload**: Bypasses native file dialog for seamless automation
  - **Processing Wait**: Waits for upload completion indicators
  - **Continue Flow**: Clicks "Continue" button after successful upload
- **Simple Click Strategy**: Single click with data-qa attribute targeting
- **Error Handling**: Comprehensive error detection and recovery mechanisms

**Step 6: Categories Selection**
- URL: `/nx/create-profile/categories`
- If current path is correct, save current user.session_state. Else mark as failed.
- **First Category Selection**: Clicks the first category on the left menu (e.g., "Accounting & Consulting")
- **Pause After Selection**: Waits 2-3 seconds after category selection
- **First Specialty Selection**: Selects the first available specialty on the right panel (e.g., "Personal & Professional Coaching")
- **Robust Selection**: Multiple selector strategies for both categories and specialties
- **Smart Clicking**: 2 different click strategies to ensure proper selection
- **State Verification**: Checks if elements are already selected before clicking

**Step 7: Skills Selection**
- URL: `/nx/create-profile/skills`
- If current path is correct, save current user.session_state. Else mark as failed.
- **Token Selection**: Clicks up to 3 skill tokens from available options
- **Fallback Handling**: Multiple selector strategies for different UI variations

**Step 8: Professional Title**
- URL: `/nx/create-profile/title`
- If current path is correct, save current user.session_state. Else mark as failed.
- **Job Title Input**: Types a professional job title (e.g., "Full-Stack Software Engineer", "Senior Software Developer")
- **Smart Selection**: Randomly selects from 20+ professional job titles for variety
- **Field Clearing**: Uses Ctrl+A and Backspace to clear existing content
- **Dual Input Strategy**: Human-like typing + JavaScript value setting as fallback
- **Input Verification**: Verifies the title was entered correctly with retry logic
- **Robust Detection**: 7 different selector strategies to find the title input field

**Step 9: Employment History**
- URL: `/nx/create-profile/employment`
- If current path is correct, save current user.session_state. Else mark as failed.
- **Add Experience Button**: Clicks the "Add experience" button to open modal
- **Tab-Based Navigation**: Uses keyboard tab navigation to focus fields in correct order
- **Form Filling**: Completes employment form with realistic data:
  - Job Title: "Senior Software Engineer" (tab navigation + enter to deselect)
  - Company: "Tech Solutions Inc" (tab navigation + enter to deselect)
  - Location: "New York" (tab navigation + combobox selection)
  - Country: "United States" (tab navigation + combobox selection)
  - Currently Working: Checked (tab navigation + space)
  - Start Date: January 2020 (tab navigation + combobox selection)
  - End Date: December 2023 (tab navigation + combobox selection)
  - Description: Professional job description (tab navigation)
- **Modal Management**: Opens modal, fills all fields using tab navigation, clicks Save, verifies modal close
- **Save & Close**: Properly saves and closes modal with verification

**Step 10: Education**
- URL: `/nx/create-profile/education`
- **Smart Mode Detection**: 
  - **Manual Mode** (`--upload` false): Always clicks "Add Education" button and fills form
  - **Upload Mode** (`--upload` true): Tries Next button first, then adds education if needed
- **Add Education Button**: Clicks the "Add Education" button to open modal
- **Education Form Filling**: Completes education form with realistic data:
  - **School**: "Stanford University" (required field)
  - **Degree**: "Bachelor of Science"
  - **Field of Study**: "Computer Science"
  - **Dates Attended**: 2018-2022 (dropdown selection)
  - **Description**: Professional education description
- **Modal Management**: Opens modal, fills all fields, clicks Save, waits for modal close
- **Robust Detection**: 8 different selector strategies for Add Education button

**Step 11: Languages**
- URL: `/nx/create-profile/languages`
- If current path is correct, save current user.session_state. Else mark as failed.
- **Language Selection**: Selects languages and proficiency levels
- **Multiple Languages**: Handles multiple language selections

#### **Final Steps (12-15)**
**Step 12: Overview/Bio**
- URL: `/nx/create-profile/overview`
- If current path is correct, save current user.session_state. Else mark as failed.
- **Bio Writing**: Fills 100+ character professional bio
- **Content Generation**: Creates compelling professional description

**Step 13: Rate Setting**
- URL: `/nx/create-profile/rate`
- If current path is correct, save current user.session_state. Else mark as failed.
- **Rate Entry**: Sets competitive hourly rate ($10-20 range)
- **Field Validation**: Ensures proper rate entry with retry logic

**Step 14: Location & Personal Info**
- URL: `/nx/create-profile/location`
- If current path is correct, save current user.session_state. Else mark as failed.
- Without `--skip-location` flag:
  - **Address Filling**: Smart autocomplete for all address fields
  - **Profile Picture**: Uploads default profile picture
  - **Phone Verification**: 
    - **Real OTP Integration**: Uses TextVerified.com API for actual SMS codes
    - **Smart OTP Handling**: Checks for existing codes before requesting new ones
    - **Modal Detection**: Handles both "send verification" and "enter code" modals
    - **Error Recovery**: Graceful handling of expired codes and API failures
    - **Fallback Support**: Falls back to test codes if API fails
- With `--skip-location` flag:
  - **Mark as rate completed**: Update user.rate_step_completed_at as current datetime and gracefully close the session.

**Step 15: Profile Submission**
- URL: `/nx/create-profile/submit`
- **Final Review**: Completes profile creation process
- **Success Verification**: Confirms successful profile creation

#### 6.3: Automation Architecture & Robustness

The automation uses a comprehensive, battle-tested architecture with multiple layers of robustness:

**Comprehensive Step Handlers:**
- **Location**: `src/services/loginAutomation.ts` contains all step implementations
- **Battle-Tested**: Each step has been extensively tested and refined
- **Error Handling**: Comprehensive error detection and recovery mechanisms
- **Fallback Strategies**: Multiple selector strategies with text-based fallbacks

**Smart Navigation & Fallbacks:**
- **URL Navigation**: Direct URL navigation when UI elements are missing
- **Button Detection**: Multiple selector strategies for "Next" buttons
- **Tab+Enter Fallback**: Keyboard navigation when direct clicks fail
- **Graceful Degradation**: Continues progression even with UI variations

**Modal & Form Handling:**
- **Modal Detection**: Automatic detection and opening of employment/education modals
- **Form Filling**: Realistic data entry with validation
- **Smart Checkboxes**: Handles "currently working" to skip end dates
- **Save & Close**: Proper modal lifecycle management

**Error Recovery & Resilience:**
- Retries failed interactions with different selectors
- Falls back to text-based element search
- **Lenient Field Verification**: Checks for content presence rather than exact matches
- **Session State Management**: Automatic saving/restoration with error handling
- **Network Error Recovery**: Graceful handling of proxy/connection failures
- Continues with partial success when possible

#### 6.4: Improved Field Verification System

The automation uses a **lenient verification approach** to avoid false negatives from autocomplete and UI variations:

**Lenient Verification Strategy:**
- **Rate Fields**: Checks if field has any value instead of exact match
- **Phone Fields**: Verifies digits are present rather than exact format
- **Date Fields**: Confirms date content exists without strict format checking
- **Password Fields**: Validates any value is entered, retries if empty
- **General Fields**: Checks for content presence, not exact text matching

**Benefits:**
- **Reduced False Negatives**: Avoids failures due to autocomplete variations
- **Higher Success Rates**: More reliable field completion verification
- **Better User Experience**: Fewer unnecessary retries and failures
- **Robust Automation**: Handles UI variations gracefully

**Possible outcomes:**
- ✅ Success: All steps completed → User marked as successful
- ❌ Error: Specific step failure → Marks with appropriate error code
- ❌ Error: Navigation timeout → Marks as `NAVIGATION_TIMEOUT`
- ❌ Error: Element not found → Marks with specific error code

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

### Recent Improvements & New Features

#### Enhanced Phone Verification Flow
- **Real OTP Integration**: Uses TextVerified.com API instead of hardcoded "12345"
- **Smart OTP Handling**: Checks for existing OTP before sending code, or gets new OTP after sending
- **Fallback Support**: Falls back to test code if TextVerified API fails
- **Robust Modal Detection**: Handles both "send verification" and "enter your code" modals
- **Comprehensive Error Detection**: Detects expired codes, invalid inputs, retry messages
- **Visual Error State Detection**: Checks for error styling in input fields
- **Proper Success/Failure Handling**: No more false success reports

#### Improved Field Verification System
- **Lenient Verification**: Checks for field content rather than exact matches to avoid false negatives
- **Rate Field**: Verifies field has any value instead of exact match (handles formatting)
- **Phone Field**: Verifies field has digits instead of exact match (handles formatting)
- **Date Field**: Verifies field has any value instead of exact match (handles date formatting)
- **Password Field**: Verifies field has any value instead of exact match (handles input delays)
- **General Fields**: All form fields use lenient verification to prevent false failures

#### Enhanced Location Step
- **Smart Address Input**: Character-by-character typing with autocomplete selection
- **Correct Phone Number**: No country code prefix, uses raw phone number (e.g., "2314992031")
- **Lenient Field Verification**: Checks for field content rather than exact matches to avoid false negatives
- **Auto-Retry Logic**: Automatically retries failed field inputs with proper validation
- **Smart Address Autocomplete**: Direct keyboard navigation (down arrow + enter)
- **City Field**: Auto-detection if already filled from street address
- **State Field**: Auto-detection if already filled from city selection
- **Efficient Processing**: Skips redundant input when fields are auto-populated

#### Session Management
- **Restore-Session Flag**: Reuse existing sessions instead of fresh login
- **Session State Saving**: Automatically saves cookies, localStorage, and browser state
- **Proxy Port Management**: User-specific proxy ports with automatic increment
- **Fallback Logic**: Graceful fallback to normal login if session restoration fails

#### Performance Optimizations
- **Reduced Network Idle Timeouts**: Faster page transitions (200ms-1s vs 1-2s)
- **Shorter Navigation Timeouts**: Faster navigation (5-8s vs 10-15s)
- **Optimized Wait Strategies**: Uses `domcontentloaded` instead of `networkidle2`
- **Better Error Recovery**: Faster retry mechanisms with shorter delays

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
- `up_created_at` (ISO 8601 date/time - marks user as ready for processing)
- `location_street_address` (Street address for profile creation)
- `location_city` (City for profile creation)
- `location_state` (State/Province for profile creation)
- `location_post_code` (ZIP/Postal code for profile creation)
- `birth_date` (Date of birth in YYYY-MM-DD format for profile creation)

**Enhanced Typing System**: The automation includes specialized methods for different field types:
- **Combobox/Autocomplete Fields**: Handles dropdown selection with proper timing and validation
- **Date Fields**: Slow, deliberate typing with Tab navigation for validation
- **Standard Fields**: Robust verification with automatic retry logic

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
- If --force is used, updates existing users with new data
- If optional fields are provided, they will be applied after user creation

Example (tab-delimited):
```
first_name	last_name	email	password	country_code	attempt_count	last_attempt_at	last_error_code	last_error_message	success_at	captcha_flagged_at	up_created_at	location_street_address	location_city	location_state	location_post_code	birth_date
Zoe	Bennett	zoe.bennet03@outlook.com	workhard2025!	US	0												2025-08-18T10:00:00Z	1200 Market St	San Francisco	California	94102	2003-04-30
```

### Process Users
Run the automation for pending users:

**Important**: The `process-users` command only processes users where `up_created_at` is not null. This allows for selective processing of users who have been marked as ready for Upwork profile creation.

**User Processing Filter:**
- **Selective Processing**: Only users with `up_created_at` timestamp will be processed
- **Skipped Users**: Users without `up_created_at` are not considered "pending"
- **Controlled Workflow**: Allows for selective processing of users ready for Upwork
- **Status Monitoring**: Use `npm start stats` to see actual pending user count

```bash
# Process 5 users (default) - only users with up_created_at set
npm start process-users

# Process specific number of users
npm start process-users -- --limit 1

# Run in headless mode
npm start process-users -- --headless

# Skip location step (except profile picture) and redirect to submit page
npm start process-users -- --skip-otp

# Combine flags for different scenarios
npm start process-users -- --upload --restore-session --skip-otp --limit 1
```

### View Statistics
Check the current status:

```bash
npm start stats
```

### Restore Session and Open Location Page
Restore a user's saved session and open the Upwork location page for manual completion:

```bash
# Restore session in headless mode (default)
npm start restore-session -- --user-id 1

# Restore session in headful mode using system Chrome
npm start restore-session -- --user-id 1 --headful
```

This command will:
- **Load Session State**: Restore cookies, localStorage, and browser metadata from database
- **Apply Proxy Settings**: Use the user's sticky proxy port (10001+)
- **Launch Browser**: Open Chrome in headful mode (when using `--headful`)
- **Navigate to Location Page**: Automatically go to Upwork's location step
- **Keep Browser Open**: Browser remains open for manual completion
- **Session Persistence**: All session data is preserved for seamless continuation

**Headful Mode Features:**
- **System Chrome**: Uses the actual Chrome browser installed on your system
- **Natural Browsing**: Behaves exactly like a regular Chrome browser
- **Full Functionality**: All buttons, JavaScript, and interactions work normally
- **No Automation Detection**: Appears as a normal user browsing session
- **Session Continuity**: Maintains login state and proxy configuration

**Use Cases:**
- Complete location step manually after automated profile creation
- Handle phone verification or other manual steps
- Debug profile creation issues with full browser access
- Continue automation from where it left off

**Example Workflow:**
1. Run automated profile creation: `npm start process-users -- --limit 1`
2. When automation stops at location step, restore session: `npm start restore-session -- --user-id 1 --headful`
3. Complete location details manually in the opened browser
4. Press Ctrl+C to close when finished

### Wait for OTP from TextVerified.com
Wait for SMS verification codes from TextVerified.com API for phone verification:

```bash
# Wait for OTP for user ID 1 with default timeout (50 seconds)
npm start wait-otp -- --user-id 1

# Wait for OTP with custom timeout (60 seconds)
npm start wait-otp -- --user-id 1 --timeout 60

# Test TextVerified API and list SMS messages
npm start test-textverified

# Check SMS messages by phone number
npm start check-sms -- --phone 2314992031

# Check SMS messages from last 5 minutes only
npm start check-sms -- --phone 2314992031 --recent
```

This command will:
- **Initialize TextVerified Service**: Connect to TextVerified.com API using your credentials
- **Check Account Balance**: Display your current TextVerified account balance
- **Get Last OTP**: Returns the most recent OTP from all available SMS messages (not just recent ones)
- **Extract OTP**: Parse and display the verification code from SMS messages
- **Timeout Handling**: Exit gracefully if no SMS is received within the timeout period

**Environment Variables Required:**
```env
TEXTVERIFIED_API_KEY=your_api_key
TEXTVERIFIED_EMAIL=your_email
```

**Example Output:**
```
[INFO] Waiting for OTP for user 1 (timeout: 50s)
[INFO] Current balance: 0.5
[INFO] Polling for SMS messages...
[INFO] Found 3 SMS messages
[INFO] ✅ OTP found in SMS: 12345
[INFO] SMS Message: Your verification code is 12345
OTP: 12345
```

**Use Cases:**
- **Manual Phone Verification**: Get real SMS codes for phone verification steps
- **Real OTP Testing**: Test with actual SMS codes instead of hardcoded values
- **Production Automation**: Integrate with real phone verification services
- **Debugging Verification**: Troubleshoot phone verification issues with real codes

### Check SMS Messages
Check SMS messages from TextVerified.com API by phone number:

```bash
# Check all SMS messages for a phone number
npm start check-sms -- --phone 2314992031

# Check only recent SMS messages (last 5 minutes)
npm start check-sms -- --phone 2314992031 --recent
```

This command will:
- **Filter by Phone Number**: Shows only SMS messages for the specified phone number
- **Parse OTP Codes**: Automatically extracts and displays OTP codes from SMS content
- **Time Filtering**: Option to show only messages from the last 5 minutes
- **Detailed Output**: Shows timestamp, OTP code, and full SMS message content

**Example Output:**
```
📱 Extracted OTP Codes:
1. [8/17/2025, 11:23:12 PM] OTP: 41592
   Message: Your Upwork verification code is 41592.
2. [8/17/2025, 3:53:26 PM] OTP: 44682
   Message: Your Upwork verification code is 44682.
```

**Integration with Automation:**
The automation now automatically integrates with TextVerified:
1. **Real OTP Usage**: Automation uses real OTP from TextVerified instead of hardcoded "12345"
2. **Smart OTP Handling**: Checks for existing OTP before sending code, or gets new OTP after sending
3. **Fallback Support**: Falls back to test code if TextVerified API fails
4. **Automatic Integration**: No manual intervention needed - OTP is automatically retrieved and entered

### Test Proxy Configuration
Test your proxy configuration and verify IP details:

```bash
# Test proxy in visible mode (default)
npm start test-proxy

# Test proxy in headless mode
npm start test-proxy -- --headless
```

This command will:
- **Load Proxy Configuration**: Automatically load proxy settings from environment variables
- **Display Proxy Info**: Show proxy host, port, country, and rotation settings
- **Test Connection**: Visit httpbin.org/ip to verify proxy connection
- **Show IP Details**: Display the IP address and location information
- **Validate Setup**: Confirm that the proxy is working correctly

**Example Output:**
```
[INFO] Testing proxy configuration...
[INFO] Decodo proxy configuration detected
[INFO] { proxyHost: "us.decodo.com", proxyPort: 10000, proxyCountry: "us", proxyZipCode: "94102", proxyRotateMinutes: 10, proxyUsername: "user-spcecpm8t1-country-us-zip-94102" }
[INFO] Testing proxy connection...
[INFO] Successfully connected through proxy
[INFO] Page content: <!DOCTYPE html>
<html>
<head>
    <title>httpbin.org</title>
    ...
    "origin": "203.45.67.89"
    ...
</html>
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
├── automation/                    # Automation framework
│   ├── LoginAutomation.ts        # Main automation orchestrator
│   ├── FormAutomation.ts         # Form filling utilities
│   ├── NavigationAutomation.ts   # Navigation and button clicking
│   └── steps/                    # Step-specific handlers
│       ├── ExperienceStepHandler.ts # Experience selection step
│       ├── GoalStepHandler.ts # Work goals selection step
│       ├── WorkPreferenceStepHandler.ts # Work preferences step
│       ├── ResumeImportStepHandler.ts # Resume import with dual mode support
│       ├── CategoriesStepHandler.ts # Categories and specialties selection step
│       ├── TitleStepHandler.ts # Job title input step
│       ├── SkillsStepHandler.ts # Skills selection step
│       ├── EducationStepHandler.ts # Education form step
│       ├── OverviewStepHandler.ts # Bio/overview step
│       └── LocationStepHandler.ts # Location step with OTP handling
├── services/                     # Core business logic
│   ├── loginAutomation.ts        # Complete 15-step profile creation
│   ├── userService.ts            # User database operations
│   ├── upworkService.ts          # Upwork-specific automation logic
│   ├── textVerifiedService.ts    # SMS verification API integration
│   └── sessionService.ts         # Session state management
├── browser/                      # Browser management
│   ├── browserManager.ts         # Browser lifecycle and proxy setup
│   └── puppeteer.ts              # Puppeteer configuration
├── database/                     # Data persistence
│   ├── connection.ts             # Database connection
│   ├── migrate.ts                # Migration runner
│   └── migrations/               # Database schema migrations
├── commands/                     # CLI commands
│   └── importCsv.ts              # CSV import functionality
├── utils/                        # Utilities
│   ├── logger.ts                 # Structured logging
│   ├── csv.ts                    # CSV parsing utilities
│   └── resumeGenerator.ts        # PDF resume generation
├── types/                        # TypeScript definitions
│   └── database.ts               # Database types and interfaces
└── main.ts                       # CLI entry point

assets/
├── images/
│   └── profile-picture.png       # Default profile picture
└── resumes/                      # Generated PDF resumes
```

**Key Components:**

- **`loginAutomation.ts`**: Contains all 15 step handlers with comprehensive error handling
- **`LoginAutomation.ts`**: Orchestrates the automation flow and manages session state
- **`textVerifiedService.ts`**: Handles real SMS verification via TextVerified.com API
- **`sessionService.ts`**: Manages browser session persistence and restoration
- **`resumeGenerator.ts`**: Generates ATS-friendly PDF resumes from user data

## Configuration

### Environment Variables

- `DATABASE_URL`: PostgreSQL connection string
- `LOG_LEVEL`: Logging level (debug, info, warn, error)
- `PUPPETEER_HEADLESS`: Run browser in headless mode (true/false)
- `PUPPETEER_TIMEOUT`: Browser timeout in milliseconds
- `PUPPETEER_USER_DATA_DIR`: Chrome user data directory
- `UPWORK_LOGIN_URL`: Upwork login page URL
- `DEBUG_EMAIL`: (Optional) Email for reference (not used for automation)
- `DEBUG_PASSWORD`: (Optional) Password for reference (not used for automation)

### Skip Location Flag

The `--skip-location` flag allows you to stop the automation at the location page without filling it out.

**Usage:**
```bash
npm start process-users -- --limit 1 --skip-location
```

**Behavior:**
- ✅ **Executes all steps**: Runs through welcome, experience, goal, work preference, resume import, categories, skills, title, employment, education, languages, overview, and rate steps
- ✅ **Stops at location page**: When automation reaches the location page (after completing the rate step), it stops and marks completion
- ✅ **Marks completion**: Sets `user.rate_step_completed_at` with current datetime
- ✅ **No location form**: Does not fill out the location form (date of birth, address, phone verification, etc.)

**Database Schema:**
The `users` table now includes a `rate_step_completed_at` column:
```sql
ALTER TABLE users ADD COLUMN rate_step_completed_at TIMESTAMP;
```

### Manual OTP System

The `--skip-otp` flag now uses a manual OTP system that waits for OTP codes to be set in the database.

#### Manual OTP Commands

**Set Manual OTP:**
```bash
npm start set-manual-otp -- --user-id 6 --otp 12345
```

This sets the manual OTP for user 6 to 12345. The automation will wait up to 5 minutes, checking every 5 seconds for this OTP.

#### Manual OTP Behavior

When using `--skip-otp`:
- ✅ **Waits for manual OTP**: Checks database every 5 seconds for up to 5 minutes
- ✅ **Auto-clears OTP**: After retrieving the OTP, it's automatically cleared from the database
- ✅ **Fallback to default**: If no manual OTP is set within 5 minutes, uses default "12345"
- ✅ **Redirect on failure**: If OTP verification fails, redirects to submit page with 4 retries

#### Database Schema

The `users` table now includes a `manual_otp` column:
```sql
ALTER TABLE users ADD COLUMN manual_otp INTEGER;
```

### TextVerified.com API Configuration

For SMS verification with real phone numbers:

- `TEXTVERIFIED_API_KEY`: Your TextVerified.com API key
- `TEXTVERIFIED_EMAIL`: Your TextVerified.com account email

### Proxy Configuration (Decodo)

The application supports residential proxy configuration using Decodo proxy service:

```env
# Residential Proxy Configuration (Decodo)
PROXY_HOST=us.decodo.com        # country.decodo.com format (e.g., us.decodo.com)
PROXY_PORT=10000                # Not used - auto-selected: 10000=rotating, 10001=sticky(debug)
PROXY_USER=username             # your session ID (exactly as provided by Decodo)
PROXY_PASS=password             # your proxy password
PROXY_COUNTRY=us                # country code (e.g., us|uk|sg|ua)
PROXY_ZIP_CODE=94102            # zip code for location targeting
PROXY_ROTATE_MINUTES=10         # sticky duration per run (set by you)
```

**Username Format:**
The application automatically constructs the full username in the format:
- With country and zip: `user-{session}-country-{country}-zip-{zip}`
- With country only: `user-{session}-country-{country}`
- Example: `user-spcecpm8t1-country-us-zip-94102`

**Proxy Features:**
- **Automatic Configuration**: Proxy settings are automatically loaded from environment variables
- **Authentication**: Automatic proxy authentication for each browser session
- **Country Selection**: Specify target country for residential IPs
- **Session Management**: Sticky sessions with configurable duration
- **Fallback Support**: Gracefully falls back to direct connection if proxy is not configured

**Proxy Modes:**

The application automatically selects the appropriate proxy mode based on usage:

#### **Rotating Mode (Port 10000)**
- **Used by**: `process-users`, `test-proxy` commands
- **Purpose**: Production automation with maximum anonymity
- **IP Changes**: Every request gets a different IP
- **Best for**: Bulk processing, avoiding detection

#### **Sticky Mode (Port 10001)**
- **Used by**: `visit-login --debug` command
- **Purpose**: Debugging and development with session persistence
- **IP Persistence**: Same IP maintained for the session
- **Best for**: Debugging, maintaining login state, development

**Proxy Benefits:**
- **IP Rotation**: Avoid IP-based rate limiting and blocking
- **Geographic Targeting**: Use IPs from specific countries
- **Residential IPs**: Higher success rates with residential proxy IPs
- **Session Persistence**: Maintain consistent IP during automation sessions

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

### Profile Creation Errors:
- `NAVIGATION_TIMEOUT`: Page navigation timeout
- `EXPERIENCE_NEXT_NOT_FOUND`: Next button missing on experience page
- `EXPERIENCE_NAVIGATION_FALLBACK_FAILED`: URL fallback navigation failed
- `GOAL_NEXT_NOT_FOUND`: Next button missing on goal page
- `WORK_PREF_PAGE_NOT_FOUND`: Work preference page not detected
- `WORK_PREF_CHECKBOX_NOT_FOUND`: Work preference checkbox not found
- `RESUME_IMPORT_PAGE_NOT_FOUND`: Resume import page not detected
- `RESUME_PDF_GENERATION_FAILED`: Failed to generate PDF resume
- `RESUME_PDF_FILE_NOT_FOUND`: Generated PDF file not found on disk
- `RESUME_UPLOAD_BUTTON_NOT_FOUND`: "Upload your resume" button not found
- `RESUME_UPLOAD_MODAL_NOT_FOUND`: Upload modal did not appear
- `CHOOSE_FILE_LINK_NOT_FOUND`: "Choose file" link not found in modal
- `FILE_INPUT_NOT_FOUND`: File input not found after clicking choose file
- `RESUME_CONTINUE_BUTTON_NOT_FOUND`: Continue button not found after resume upload
- `RESUME_CONTINUE_BUTTON_DISABLED`: Continue button found but is disabled or not visible
- `RESUME_MANUAL_BUTTON_NOT_FOUND`: "Fill out manually" button not found
- `MANUAL_BUTTON_NOT_FOUND`: "Fill out manually" button not found (new handler)
- `MANUAL_BUTTON_CLICK_FAILED`: Failed to click "Fill out manually" button
- `RESUME_IMPORT_MANUAL_NAVIGATION_FAILED`: Failed to navigate from resume import page via manual button
- `RESUME_IMPORT_STEP_STUCK`: Resume import step appears to be stuck - URL did not change after completion
- `CATEGORIES_LEFT_ITEM_NOT_FOUND`: Category selection item not found
- `CATEGORIES_RIGHT_CHECKBOX_NOT_FOUND`: Subcategory checkbox not found
- `CATEGORIES_NEXT_NOT_FOUND`: Next button missing on categories page
- `SKILLS_SELECTION_FAILED`: Skills selection step failed
- `TITLE_INPUT_NOT_FOUND`: Professional title input not found
- `EMPLOYMENT_ADD_BUTTON_NOT_FOUND`: "Add experience" button not found
- `EMPLOYMENT_MODAL_NOT_VISIBLE`: Employment modal did not appear
- `MODAL_TITLE_INPUT_NOT_FOUND`: Job title input not found in modal
- `MODAL_COMPANY_INPUT_NOT_FOUND`: Company input not found in modal
- `MODAL_DESCRIPTION_NOT_FOUND`: Description textarea not found in modal
- `MODAL_SAVE_NOT_FOUND`: Save button not found in modal
- `EDUCATION_ADD_BUTTON_NOT_FOUND`: "Add education" button not found
- `EDUCATION_MODAL_NOT_FOUND`: Education modal not detected
- `LANGUAGES_SELECTION_FAILED`: Languages selection step failed
- `LOCATION_FIELD_NOT_FOUND`: Location field not found
- `LOCATION_CITY_NOT_FOUND`: City field not found
- `LOCATION_STREET_ADDRESS_NOT_FOUND`: Street address field not found

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

## Proxy Troubleshooting

### Common Issues and Solutions

**1. Proxy Connection Failed**
```bash
# Test proxy configuration
npm start test-proxy
```
- Verify proxy credentials are correct
- Check if proxy service is active
- Ensure firewall allows proxy connections

**2. IP Not Rotating**
- Check `PROXY_ROTATE_MINUTES` setting
- Verify country code is supported by your proxy provider
- Contact proxy provider for session management issues

**3. Slow Connection**
- Try different proxy servers from your provider
- Check your internet connection
- Consider using proxies closer to your target location

**4. Authentication Errors**
- Verify `PROXY_USER` and `PROXY_PASS` are correct
- Check if username includes required flags (e.g., country codes)
- Ensure account has sufficient credits/bandwidth

### Best Practices

**Proxy Configuration:**
- Use residential proxies for better success rates
- Rotate IPs frequently to avoid detection
- Use proxies from the same country as your target users
- Monitor proxy performance and switch providers if needed

**Rate Limiting:**
- Implement delays between automation runs
- Use different proxy sessions for different users
- Monitor for IP blocks and adjust patterns accordingly

**Session Management:**
- Keep sessions short to avoid IP reputation issues
- Use sticky sessions for multi-step processes
- Clear browser data between sessions

## Disclaimer

This tool is for educational and research purposes only. Users are responsible for ensuring compliance with Upwork's terms of service and applicable laws. The authors are not responsible for any misuse of this software.
