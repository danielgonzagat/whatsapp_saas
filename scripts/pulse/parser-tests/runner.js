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

const MSG_TEST_FAIL_PREFIX = 'x ';
const MSG_SUITE_FAILED = '\nx Some parser tests failed';
const MSG_SUITE_PASSED = '\nAll parser tests passed';

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
      console.error(`${MSG_TEST_FAIL_PREFIX}${path.basename(testFile)} failed`);
      failed = true;
    }
  }

  if (failed) {
    console.error(MSG_SUITE_FAILED);
    process.exit(1);
  } else {
    console.log(MSG_SUITE_PASSED);
    process.exit(0);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
