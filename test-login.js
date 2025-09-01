#!/usr/bin/env node

// Simple test script to verify login flow
const { spawn } = require('child_process');

console.log('Testing login flow with increased delays...');

const child = spawn('node', ['dist/main.js', 'upwork', '--user-id', '23', '--pages', '1', '--headless'], {
  stdio: 'inherit'
});

child.on('close', (code) => {
  console.log(`Test completed with exit code ${code}`);
  process.exit(code);
});

child.on('error', (error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
