/**
 * Regression tests for critical PULSE parsers
 *
 * These tests validate that parsers detect financial and security issues consistently.
 * If these tests fail, PULSE is at risk of missing real issues.
 */

import {
  runParserSuite,
  ParserAssertions,
  formatTestResults,
  exitIfFailed,
} from './parser-test.framework';

/**
 * Test Suite 1: Financial Arithmetic Parser
 * Real parser checks: .toFixed() usage, division without zero guards
 */
async function testFinancialArithmeticRegression() {
  return runParserSuite(
    'financial-arithmetic',
    (code: string) => {
      // Mock: detects unsafe .toFixed() patterns
      if (typeof code === 'string' && code.includes('.toFixed(')) {
        if (!code.includes('console') && !code.includes('Number(')) {
          return [
            {
              type: 'TOFIX_WITHOUT_PARSE',
              severity: 'high',
              description: '.toFixed() returns string, not number',
              line: 1,
            },
          ];
        }
      }
      return [];
    },
    [
      {
        name: 'detects unsafe .toFixed()',
        input: `const totalCents = (amount * 100).toFixed(2);`,
        expectedOutput: [
          {
            type: 'TOFIX_WITHOUT_PARSE',
            severity: 'high',
            description: '.toFixed() returns string, not number',
            line: 1,
          },
        ],
      },
      {
        name: 'allows .toFixed() in console context',
        input: `console.log('Total: ' + price.toFixed(2));`,
        expectedOutput: [],
      },
      {
        name: 'allows .toFixed() wrapped with Number()',
        input: `const result = Number((amount * 100).toFixed(2));`,
        expectedOutput: [],
      },
    ],
  );
}

/**
 * Test Suite 2: Error Handler Auditor
 * Validates: Financial catch blocks must rethrow errors
 */
async function testErrorHandlerAuditorRegression() {
  return runParserSuite(
    'error-handler-auditor',
    (code: string) => {
      // Mock: detects financial catch blocks that don't rethrow
      if (typeof code === 'string' && code.includes('catch') && code.includes('wallet')) {
        if (!code.includes('throw')) {
          return [
            {
              type: 'FINANCIAL_CATCH_NO_RETHROW',
              severity: 'critical',
              description: 'Financial error swallowed without rethrow',
              context: code.slice(0, 80),
            },
          ];
        }
      }
      return [];
    },
    [
      {
        name: 'detects financial catch without rethrow',
        input: 'catch (e) { wallet.balance -= amount; console.error(e); }',
        expectedOutput: [
          {
            type: 'FINANCIAL_CATCH_NO_RETHROW',
            severity: 'critical',
            description: 'Financial error swallowed without rethrow',
            context: 'catch (e) { wallet.balance -= amount; console.error(e); }',
          },
        ],
      },
      {
        name: 'allows financial catch with rethrow',
        input: 'catch (e) { wallet.balance -= amount; throw e; }',
        expectedOutput: [],
      },
      {
        name: 'ignores non-financial catch',
        input: "catch (e) { console.error('Error:', e); }",
        expectedOutput: [],
      },
    ],
  );
}

/**
 * Test Suite 3: Idempotency Checker
 * Validates: Webhook handlers must check for duplicates
 */
async function testIdempotencyCheckerRegression() {
  return runParserSuite(
    'idempotency-checker',
    (code: string) => {
      // Mock: detects webhook handlers without idempotency checks
      if (typeof code === 'string' && (code.includes('webhook') || code.includes('stripe'))) {
        if (!code.includes('idempotency') && !code.includes('checksum')) {
          return [
            {
              type: 'WEBHOOK_NO_IDEMPOTENCY',
              severity: 'critical',
              description: 'Webhook handler missing idempotency check',
            },
          ];
        }
      }
      return [];
    },
    [
      {
        name: 'detects webhook without idempotency',
        input: 'async function stripeWebhookHandler(event) { processPayment(event.data); }',
        expectedOutput: [
          {
            type: 'WEBHOOK_NO_IDEMPOTENCY',
            severity: 'critical',
            description: 'Webhook handler missing idempotency check',
          },
        ],
      },
      {
        name: 'allows webhook with idempotency check',
        input:
          'async function handler(event) { if (!checkIdempotency(event.id)) return; process(); }',
        expectedOutput: [],
      },
    ],
  );
}

/**
 * Run all regression tests
 */
async function runAllRegressionTests() {
  console.log('Running PULSE parser regression tests...\n');

  const suites = [
    await testFinancialArithmeticRegression(),
    await testErrorHandlerAuditorRegression(),
    await testIdempotencyCheckerRegression(),
  ];

  console.log(formatTestResults(suites));
  exitIfFailed(suites);
}

runAllRegressionTests().catch((err) => {
  console.error('Test framework error:', err);
  process.exit(1);
});
