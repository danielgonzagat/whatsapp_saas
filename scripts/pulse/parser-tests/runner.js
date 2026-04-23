#!/usr/bin/env node

/**
 * PULSE Parser Regression Test Runner
 *
 * Run via: node scripts/pulse/parser-tests/runner.js [--update-snapshots]
 */

const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.join(__dirname, '../../..');

async function run() {
  console.log('🔍 PULSE Parser Regression Tests\n');

  try {
    // Compile regression tests
    console.log('→ Compiling tests...');
    execSync(
      `npx ts-node --project ${path.join(rootDir, 'scripts/pulse/tsconfig.json')} ${path.join(
        __dirname,
        'regression-tests.ts',
      )}`,
      { stdio: 'inherit', cwd: rootDir },
    );

    console.log('✓ All parser tests passed');
    process.exit(0);
  } catch (err) {
    console.error('✗ Parser tests failed');
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
