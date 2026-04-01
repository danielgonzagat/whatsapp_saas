/**
 * PULSE Parser 77: Test Quality
 * Layer 11: Test Quality
 * Mode: DEEP (requires codebase scan of test files)
 *
 * CHECKS:
 * 1. Every .spec.ts / .test.ts file has at least one expect() assertion
 *    — files with only describe/it/test blocks but zero expect() are useless
 * 2. Test files with only `it.todo()` or `xit()` / `it.skip()` and no active tests
 * 3. Financial test files must test error cases (rejection, insufficient funds, etc.)
 * 4. Test files that use jest.mock() but never restore mocks (potential test pollution)
 * 5. Test files with hardcoded sleep/delays > 1000ms (slow, brittle tests)
 * 6. Test descriptions that are empty strings or generic placeholders ("test 1", "todo")
 * 7. Tests that assert on Math.random() or Date.now() directly (non-deterministic)
 *
 * REQUIRES: PULSE_DEEP=1, codebase read access
 * BREAK TYPES:
 *   TEST_NO_ASSERTION(medium) — test file or block has no expect() calls
 */
import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

const FINANCIAL_PATH_RE = /checkout|wallet|billing|payment|kloel/i;

export function checkTestQuality(config: PulseConfig): Break[] {
  if (!process.env.PULSE_DEEP) return [];
  const breaks: Break[] = [];

  const allDirs = [config.backendDir, config.frontendDir, config.workerDir];

  for (const dir of allDirs) {
    const testFiles = walkFiles(dir, ['.ts', '.tsx']).filter(f =>
      /\.(spec|test)\.(ts|tsx)$/.test(f)
    );

    for (const file of testFiles) {
      let content: string;
      try {
        content = fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }

      const relFile = path.relative(config.rootDir, file);
      const lines = content.split('\n');

      // CHECK 1: At least one expect() assertion
      const expectCount = (content.match(/\bexpect\s*\(/g) || []).length;
      if (expectCount === 0) {
        breaks.push({
          type: 'TEST_NO_ASSERTION',
          severity: 'medium',
          file: relFile,
          line: 0,
          description: 'Test file has no expect() assertions — tests pass vacuously and provide no value',
          detail: `${relFile} has ${(content.match(/\bit\s*\(|test\s*\(/g) || []).length} test block(s) but zero expect() calls`,
        });
        continue; // No need to check further if no assertions at all
      }

      // CHECK 2: Files with only skipped tests
      const activeTestCount = (content.match(/\bit\s*\(|test\s*\(/g) || []).length;
      const skippedCount = (content.match(/\bit\.skip\s*\(|xit\s*\(|xtest\s*\(|it\.todo\s*\(/g) || []).length;
      if (activeTestCount > 0 && activeTestCount === skippedCount) {
        breaks.push({
          type: 'TEST_NO_ASSERTION',
          severity: 'medium',
          file: relFile,
          line: 0,
          description: 'All tests in this file are skipped (it.skip/xit/it.todo) — no coverage provided',
          detail: `${skippedCount} skipped test(s), 0 active tests in ${path.basename(file)}`,
        });
      }

      // CHECK 3: Financial tests must cover error cases
      if (FINANCIAL_PATH_RE.test(file)) {
        const errorCasePatterns = [
          /insufficient|reject|fail|error|exception|throw/i,
          /toThrow|rejects|toBe\s*\(\s*false|toBeUndefined|toBeNull/i,
        ];
        const hasErrorCase = errorCasePatterns.some(re => re.test(content));
        if (!hasErrorCase) {
          breaks.push({
            type: 'TEST_NO_ASSERTION',
            severity: 'medium',
            file: relFile,
            line: 0,
            description: 'Financial test file has no error/rejection case tests — happy path only is insufficient',
            detail: 'Add tests for: insufficient funds, payment rejection, invalid coupon, concurrent writes',
          });
        }
      }

      // CHECK 4: jest.mock() without afterEach restore
      if (/jest\.mock\s*\(/.test(content) && !/afterEach|jest\.restoreAllMocks|jest\.clearAllMocks/i.test(content)) {
        breaks.push({
          type: 'TEST_NO_ASSERTION',
          severity: 'medium',
          file: relFile,
          line: 0,
          description: 'jest.mock() used without mock restoration — may cause test pollution across suites',
          detail: 'Add afterEach(() => jest.restoreAllMocks()) or jest.clearAllMocks() to prevent mock leakage',
        });
      }

      // CHECK 5: Hardcoded long sleeps in tests
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (/setTimeout|sleep|delay/i.test(line)) {
          const match = line.match(/(\d{4,})/);
          if (match) {
            breaks.push({
              type: 'TEST_NO_ASSERTION',
              severity: 'medium',
              file: relFile,
              line: i + 1,
              description: `Hardcoded sleep of ${match[1]}ms in test — use jest.useFakeTimers() or await event instead`,
              detail: line.slice(0, 120),
            });
          }
        }
      }

      // CHECK 6: Empty or placeholder test descriptions
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const emptyDescMatch = line.match(/\bit\s*\(\s*['"]\s*['"]/);
        const todoDescMatch = line.match(/\bit\s*\(\s*['"](?:todo|test \d+|placeholder|xxx|fixme)['"]/i);
        if (emptyDescMatch || todoDescMatch) {
          breaks.push({
            type: 'TEST_NO_ASSERTION',
            severity: 'medium',
            file: relFile,
            line: i + 1,
            description: 'Test has empty or placeholder description — tests must have meaningful names',
            detail: line.trim().slice(0, 120),
          });
        }
      }

      // CHECK 7: Non-deterministic assertions on Math.random or Date.now
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (/expect\s*\(\s*Math\.random|expect\s*\(\s*Date\.now/.test(line)) {
          breaks.push({
            type: 'TEST_NO_ASSERTION',
            severity: 'medium',
            file: relFile,
            line: i + 1,
            description: 'Test asserts on Math.random() or Date.now() — non-deterministic, will be flaky',
            detail: 'Mock these functions with jest.spyOn before testing; never assert on random/time values directly',
          });
        }
      }
    }
  }

  // TODO: Implement when infrastructure available
  // - Mutation testing score (stryker)
  // - Test execution time budget per suite
  // - Flaky test detection via repeated runs

  return breaks;
}
