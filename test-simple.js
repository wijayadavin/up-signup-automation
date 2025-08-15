#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('Upwork Crawler - Structure Test');
console.log('===============================');

// Check if build was successful
const requiredFiles = [
  'dist/main.js',
  'dist/browser/puppeteer.js',
  'dist/browser/browserManager.js',
  'dist/services/userService.js',
  'dist/services/upworkService.js',
  'dist/database/connection.js',
  'dist/utils/logger.js'
];

let allFilesExist = true;

console.log('Checking build output...');
for (const file of requiredFiles) {
  if (fs.existsSync(file)) {
    console.log(`✓ ${file}`);
  } else {
    console.log(`✗ ${file} - Missing`);
    allFilesExist = false;
  }
}

console.log('\nChecking source files...');
const sourceFiles = [
  'src/main.ts',
  'src/browser/puppeteer.ts',
  'src/browser/browserManager.ts',
  'src/services/userService.ts',
  'src/services/upworkService.ts',
  'src/database/connection.ts',
  'src/utils/logger.ts',
  'package.json',
  'tsconfig.json',
  'README.md'
];

for (const file of sourceFiles) {
  if (fs.existsSync(file)) {
    console.log(`✓ ${file}`);
  } else {
    console.log(`✗ ${file} - Missing`);
    allFilesExist = false;
  }
}

if (allFilesExist) {
  console.log('\n🎉 All files present! Project structure is correct.');
  console.log('\nNext steps:');
  console.log('1. Set up PostgreSQL database');
  console.log('2. Create .env file with DATABASE_URL');
  console.log('3. Run: npm run migrate');
  console.log('4. Run: npm start visit-login');
} else {
  console.log('\n❌ Some files are missing. Please check the build process.');
  process.exit(1);
}
