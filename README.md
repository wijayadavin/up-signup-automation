# Upwork Crawler - Sign-up Automation

A robust puppeteer-based sign-up automation tool for Upwork with PostgreSQL database integration.

## Features

- **Robust Browser Automation**: Uses puppeteer-extra with stealth plugins to avoid detection
- **PostgreSQL Database**: Stores user data and automation progress
- **Error Handling**: Comprehensive error tracking and retry mechanisms
- **Logging**: Structured logging with Pino
- **CLI Interface**: Easy-to-use command-line interface
- **Screenshot Capture**: Automatic screenshots for debugging

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

Command:
```bash
npm start import-csv -- --file data/mock_users.csv
```

Behavior:
- Skips rows missing any required fields
- Skips users whose `email` already exists
- If optional fields are provided, they will be applied after user creation

Example (tab-delimited):
```
first_name	last_name	email	password	country_code	attempt_count	last_attempt_at	last_error_code	last_error_message	success_at
Zoe	Bennett	zoe.bennet03@outlook.com	workhard2025!	SG	0				
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
│   └── upworkService.ts     # Upwork automation logic
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
- `LOGIN_PAGE_FAILED`: Unable to reach login page
- `PROCESSING_ERROR`: General processing errors
- Database connection errors
- Browser launch failures

## Screenshots

Screenshots are automatically saved to the `./screenshots/` directory for debugging purposes.

## Security Considerations

- Passwords are stored in plain text (consider encryption for production)
- User data should be handled securely
- Consider rate limiting to avoid IP blocking
- Use proxies for production use

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is for educational purposes. Please ensure compliance with Upwork's terms of service and applicable laws.

## Disclaimer

This tool is for educational and research purposes only. Users are responsible for ensuring compliance with Upwork's terms of service and applicable laws. The authors are not responsible for any misuse of this software.
