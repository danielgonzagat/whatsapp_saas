/**
 * PULSE Parser Test Framework
 *
 * Common infrastructure for regression testing PULSE parsers.
 * Supports: parameterized tests, snapshot validation, mocking, and evidence tracking.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

// ===== Test Result Types =====

export interface ParserTestCase {
  name: string;
  input: unknown;
  expectedOutput?: unknown;
  shouldThrow?: boolean;
  expectedErrorPattern?: RegExp;
}

export interface ParserTestResult {
  parserName: string;
  testName: string;
  passed: boolean;
  duration: number;
  error?: string;
  output?: unknown;
}

export interface ParserTestSuite {
  parserName: string;
  filePath: string;
  tests: ParserTestResult[];
  totalDuration: number;
  passCount: number;
  failCount: number;
}

// ===== Core Framework =====

/**
 * Assertion helpers for parser outputs
 */
export const ParserAssertions = {
  /**
   * Assert that parser output matches expected shape
   */
  matchesShape(actual: unknown, expectedShape: Record<string, string>) {
    assert.ok(typeof actual === 'object' && actual !== null, 'Output must be object');
    for (const [key, expectedType] of Object.entries(expectedShape)) {
      assert.ok(key in actual, `Missing required field: ${key}`);
      const actualType = typeof (actual as Record<string, unknown>)[key];
      assert.strictEqual(
        actualType,
        expectedType,
        `Field ${key} has type ${actualType}, expected ${expectedType}`,
      );
    }
  },

  /**
   * Assert that parser found specific issues
   */
  foundIssues(actual: unknown[], issuePatterns: string[]) {
    assert.ok(Array.isArray(actual), 'Parser output must be array');
    assert.ok(
      actual.length >= issuePatterns.length,
      `Expected at least ${issuePatterns.length} issues, found ${actual.length}`,
    );
    const actualStrings = actual.map((x) => JSON.stringify(x));
    for (const pattern of issuePatterns) {
      const found = actualStrings.some((s) => s.includes(pattern));
      assert.ok(found, `Expected to find issue containing "${pattern}"`);
    }
  },

  /**
   * Assert no false positives
   */
  noIssues(actual: unknown[]) {
    assert.ok(Array.isArray(actual), 'Parser output must be array');
    assert.strictEqual(
      actual.length,
      0,
      `Expected 0 issues, found ${actual.length}: ${JSON.stringify(actual)}`,
    );
  },

  /**
   * Assert parser output is idempotent
   */
  async idempotent(parser: (input: unknown) => unknown | Promise<unknown>, input: unknown) {
    const output1 = await Promise.resolve(parser(input));
    const output2 = await Promise.resolve(parser(input));
    assert.deepStrictEqual(output1, output2, 'Parser output must be idempotent');
  },
};

/**
 * Test runner for a single parser
 */
export async function runParserTest(
  parserName: string,
  parser: (input: unknown) => unknown | Promise<unknown>,
  testCase: ParserTestCase,
  options?: { timeout?: number },
): Promise<ParserTestResult> {
  const startTime = Date.now();
  const timeout = options?.timeout ?? 5000;

  try {
    // Promise with timeout
    const resultPromise = Promise.resolve(parser(testCase.input));
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Test timeout: ${timeout}ms`)), timeout),
    );

    const output = await Promise.race([resultPromise, timeoutPromise]);
    const duration = Date.now() - startTime;

    // Validate output
    if (testCase.shouldThrow) {
      return {
        parserName,
        testName: testCase.name,
        passed: false,
        duration,
        error: `Expected parser to throw but did not`,
      };
    }

    if (testCase.expectedOutput !== undefined) {
      try {
        assert.deepStrictEqual(output, testCase.expectedOutput);
      } catch (e) {
        return {
          parserName,
          testName: testCase.name,
          passed: false,
          duration,
          error: `Output mismatch: ${(e as Error).message}`,
          output,
        };
      }
    }

    return {
      parserName,
      testName: testCase.name,
      passed: true,
      duration,
      output,
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    if (testCase.shouldThrow) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (testCase.expectedErrorPattern?.test(errorMessage)) {
        return {
          parserName,
          testName: testCase.name,
          passed: true,
          duration,
        };
      }
      return {
        parserName,
        testName: testCase.name,
        passed: false,
        duration,
        error: `Error thrown but did not match pattern: ${errorMessage}`,
      };
    }

    return {
      parserName,
      testName: testCase.name,
      passed: false,
      duration,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Batch run tests for a parser
 */
export async function runParserSuite(
  parserName: string,
  parser: (input: unknown) => unknown | Promise<unknown>,
  testCases: ParserTestCase[],
  options?: { timeout?: number },
): Promise<ParserTestSuite> {
  const startTime = Date.now();
  const tests: ParserTestResult[] = [];

  for (const testCase of testCases) {
    const result = await runParserTest(parserName, parser, testCase, options);
    tests.push(result);
  }

  const totalDuration = Date.now() - startTime;
  const passCount = tests.filter((t) => t.passed).length;
  const failCount = tests.length - passCount;

  return {
    parserName,
    filePath: '',
    tests,
    totalDuration,
    passCount,
    failCount,
  };
}

// ===== Snapshot Validation =====

export interface SnapshotRegistry {
  [key: string]: unknown;
}

/**
 * Snapshot helpers for parser regression detection
 */
export const SnapshotHelpers = {
  /**
   * Load snapshot from disk
   */
  load(snapshotPath: string): SnapshotRegistry {
    if (!fs.existsSync(snapshotPath)) {
      return {};
    }
    const content = fs.readFileSync(snapshotPath, 'utf-8');
    return JSON.parse(content);
  },

  /**
   * Save snapshot to disk
   */
  save(snapshotPath: string, snapshot: SnapshotRegistry) {
    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
  },

  /**
   * Match output against snapshot
   */
  match(key: string, actual: unknown, snapshot: SnapshotRegistry): boolean {
    if (!(key in snapshot)) {
      throw new Error(`Snapshot key not found: ${key}. Run with --update-snapshots.`);
    }
    try {
      assert.deepStrictEqual(actual, snapshot[key]);
      return true;
    } catch (e) {
      return false;
    }
  },

  /**
   * Record snapshot for future comparison
   */
  record(key: string, value: unknown, snapshot: SnapshotRegistry) {
    snapshot[key] = value;
  },
};

// ===== Reporting =====

/**
 * Format test results for console output
 */
export function formatTestResults(suites: ParserTestSuite[]): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('╔══════════════════════════════════════════════════╗');
  lines.push('║    PULSE Parser Regression Tests                ║');
  lines.push('╚══════════════════════════════════════════════════╝');
  lines.push('');

  let totalTests = 0;
  let totalPassed = 0;
  let totalDuration = 0;

  for (const suite of suites) {
    totalTests += suite.tests.length;
    totalPassed += suite.passCount;
    totalDuration += suite.totalDuration;

    const status = suite.failCount === 0 ? '✓' : '✗';
    lines.push(
      `${status} ${suite.parserName}: ${suite.passCount}/${suite.tests.length} (${suite.totalDuration}ms)`,
    );

    for (const test of suite.tests) {
      if (!test.passed) {
        lines.push(`  ✗ ${test.testName}: ${test.error}`);
      }
    }
  }

  lines.push('');
  lines.push(`Total: ${totalPassed}/${totalTests} passed (${totalDuration}ms)`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Exit with error if any test failed
 */
export function exitIfFailed(suites: ParserTestSuite[]): void {
  const anyFailed = suites.some((s) => s.failCount > 0);
  if (anyFailed) {
    process.exit(1);
  }
}
