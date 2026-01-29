#!/usr/bin/env node

// Simple test to verify core functionality
console.log('Testing Kuroryuu TTS Companion...');

// Test 1: Check if main modules can be imported
try {
  const settings = require('./out/main/index.js');
  console.log('✅ Main process modules load successfully');
} catch (error) {
  console.log('❌ Main process modules failed to load:', error.message);
}

// Test 2: Check if build artifacts exist
const fs = require('fs');
const path = require('path');

const requiredFiles = [
  'out/main/index.js',
  'out/preload/index.js',
  'out/renderer/index.html'
];

let allFilesExist = true;
for (const file of requiredFiles) {
  if (fs.existsSync(path.join(__dirname, file))) {
    console.log(`✅ ${file} exists`);
  } else {
    console.log(`❌ ${file} missing`);
    allFilesExist = false;
  }
}

if (allFilesExist) {
  console.log('✅ All required build artifacts present');
} else {
  console.log('❌ Some build artifacts missing');
}

console.log('Test completed.');
