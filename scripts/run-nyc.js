#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const rawArgs = process.argv.slice(2);
const separatorIndex = rawArgs.indexOf('--');
const jestArgs = separatorIndex >= 0 ? rawArgs.slice(separatorIndex + 1) : rawArgs;

const jestBin = require.resolve('jest/bin/jest');
const coverageArgs = [
  '--coverage',
  '--coverageReporters=text-summary',
  '--coverageReporters=json-summary',
  '--coverageReporters=lcov',
  ...jestArgs,
];

const result = spawnSync(process.execPath, [jestBin, ...coverageArgs], {
  stdio: 'inherit',
  env: process.env,
  cwd: process.cwd(),
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const summaryPath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');
if (!fs.existsSync(summaryPath)) {
  console.error('⚠️  Arquivo coverage-summary.json não encontrado.');
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const totalStatements = summary.total?.statements?.pct ?? 0;
const totalLines = summary.total?.lines?.pct ?? 0;
const minPct = Number(process.env.COVERAGE_MIN || 70);

if (totalStatements < minPct || totalLines < minPct) {
  console.error(`❌ Cobertura insuficiente: statements=${totalStatements}%, lines=${totalLines}% (meta >= ${minPct}%).`);
  process.exit(1);
}

console.log(`✅ Cobertura OK: statements=${totalStatements}%, lines=${totalLines}%`);
console.log('📄 Relatórios em ./coverage');
