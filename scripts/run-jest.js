#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const jestBin = require.resolve('jest/bin/jest');
const args = process.argv.slice(2);

const child = spawn(process.execPath, [jestBin, ...args], {
  stdio: 'inherit',
  env: process.env,
  cwd: process.cwd(),
});

child.on('exit', (code) => {
  process.exit(code);
});
