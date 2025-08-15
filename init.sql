-- Initialize the up_crawler database
-- This script runs when the PostgreSQL container starts for the first time

-- Create the database if it doesn't exist (already handled by POSTGRES_DB env var)
-- CREATE DATABASE up_crawler;

-- Connect to the up_crawler database
\c up_crawler;

-- Create extensions if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- The actual tables will be created by our migration system
-- This is just for any additional setup needed
