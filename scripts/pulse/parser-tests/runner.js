#!/usr/bin/env node

/**
 * PULSE Parser Regression Test Runner
 *
 * Run via: node scripts/pulse/parser-tests/runner.js [--update-snapshots]
 */

const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.join(__dirname, '../../..');
const tsConfig = path.join(rootDir, 'scripts', 'pulse', 'tsconfig.json');

const TEST_FILES = [
  path.join(__dirname, 'regression-tests.ts'),
  path.join(__dirname, 'no-overclaim-gate.spec.ts'),
];

function runTestFile(testFile) {
  // CodeQL fp: js/shell-command-injection-from-environment — all arguments
  // are hardcoded constants (see TEST_FILES array and tsConfig above).
  // No user-controlled input reaches execFileSync.
  execFileSync('npx', ['ts-node', '--project', tsConfig, testFile], {
    stdio: 'inherit',
    cwd: rootDir,
  });
}

async function run() {
  console.log('PULSE Parser Regression Tests\n');

  let failed = false;
  for (const testFile of TEST_FILES) {
    console.log(`\n-> Running ${path.basename(testFile)}...`);
    try {
      runTestFile(testFile);
    } catch (err) {
      console.error(`x ${path.basename(testFile)} failed`);
      failed = true;
    }
  }

  if (failed) {
    console.error('\nx Some parser tests failed');
    process.exit(1);
  } else {
    console.log('\nAll parser tests passed');
    process.exit(0);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
