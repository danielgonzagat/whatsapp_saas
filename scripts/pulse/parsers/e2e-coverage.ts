/**
 * PULSE Parser 78: E2E Coverage
 * Layer 11: Test Quality
 * Mode: DEEP (requires Playwright/Cypress test file scan + optional runner)
 *
 * CHECKS:
 * 1. E2E test directory exists (e2e/, tests/, playwright/, cypress/)
 * 2. Core flows have E2E test coverage:
 *    - User registration / login flow
 *    - Checkout / payment flow (critical)
 *    - WhatsApp connection flow
 *    - Product creation flow
 *    - Workspace setup flow
 * 3. E2E tests are not all skipped
 * 4. Playwright/Cypress config exists and is not empty
 * 5. E2E tests are included in CI pipeline (check package.json scripts or CI config)
 * 6. Critical payment flow has both success and failure scenario coverage
 *
 * REQUIRES: PULSE_DEEP=1, codebase read access
 * BREAK TYPES:
 *   E2E_FLOW_NOT_TESTED(high) — critical user flow has no E2E test
 */
import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

interface CoreFlow {
  name: string;
  patterns: RegExp[];
  severity: 'critical' | 'high' | 'medium' | 'low';
}

const CORE_FLOWS: CoreFlow[] = [
  {
    name: 'User registration / signup',
    patterns: [/register|signup|sign.up|criar.conta|cadastro/i],
    severity: 'high',
  },
  {
    name: 'User login / authentication',
    patterns: [/login|sign.in|autent/i],
    severity: 'high',
  },
  {
    name: 'Checkout / payment',
    patterns: [/checkout|payment|pagamento|compra|purchase/i],
    severity: 'high',
  },
  {
    name: 'WhatsApp connection',
    patterns: [/whatsapp|qr.code|qrcode|connect.*whatsapp|whatsapp.*connect/i],
    severity: 'high',
  },
  {
    name: 'Product creation',
    patterns: [/product|produto|criar.*produto|product.*creat/i],
    severity: 'high',
  },
  {
    name: 'Workspace setup',
    patterns: [/workspace|workspac/i],
    severity: 'high',
  },
];

export function checkE2ECoverage(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // CHECK 1: E2E directory exists
  const e2eCandidates = [
    path.join(config.rootDir, 'e2e'),
    path.join(config.rootDir, 'tests'),
    path.join(config.rootDir, 'playwright'),
    path.join(config.rootDir, 'cypress'),
    path.join(config.frontendDir, 'e2e'),
    path.join(config.frontendDir, 'tests'),
    path.join(config.frontendDir, 'playwright'),
    path.join(config.frontendDir, 'cypress'),
  ];

  const e2eDir = e2eCandidates.find((d) => fs.existsSync(d));

  if (!e2eDir) {
    // No E2E directory at all — flag all core flows as missing
    for (const flow of CORE_FLOWS) {
      breaks.push({
        type: 'E2E_FLOW_NOT_TESTED',
        severity: flow.severity,
        file: 'e2e/',
        line: 0,
        description: `No E2E test directory found — "${flow.name}" flow is untested end-to-end`,
        detail:
          'Create an e2e/ directory with Playwright or Cypress and add tests for all critical flows',
      });
    }
    return breaks;
  }

  // CHECK 2: Playwright or Cypress config
  const playwrightConfig = [
    path.join(config.rootDir, 'playwright.config.ts'),
    path.join(config.rootDir, 'playwright.config.js'),
    path.join(config.frontendDir, 'playwright.config.ts'),
  ];
  const cypressConfig = [
    path.join(config.rootDir, 'cypress.config.ts'),
    path.join(config.rootDir, 'cypress.json'),
    path.join(config.frontendDir, 'cypress.config.ts'),
  ];

  const hasPlaywright = playwrightConfig.some((p) => fs.existsSync(p));
  const hasCypress = cypressConfig.some((p) => fs.existsSync(p));

  if (!hasPlaywright && !hasCypress) {
    breaks.push({
      type: 'E2E_FLOW_NOT_TESTED',
      severity: 'high',
      file: e2eDir,
      line: 0,
      description:
        'E2E directory exists but no Playwright or Cypress config found — tests cannot run',
      detail:
        'Create playwright.config.ts or cypress.config.ts at the root to enable E2E test execution',
    });
  }

  // CHECK 3: Scan E2E files for core flow coverage
  const e2eFiles = walkFiles(e2eDir, ['.ts', '.tsx', '.js', '.jsx']);

  if (e2eFiles.length === 0) {
    for (const flow of CORE_FLOWS) {
      breaks.push({
        type: 'E2E_FLOW_NOT_TESTED',
        severity: flow.severity,
        file: path.relative(config.rootDir, e2eDir),
        line: 0,
        description: `E2E directory is empty — "${flow.name}" flow is untested`,
        detail: 'Add Playwright/Cypress test files for all critical user flows',
      });
    }
    return breaks;
  }

  // Aggregate all E2E file content for flow detection
  let allE2EContent = '';
  let hasActiveTests = false;

  for (const file of e2eFiles) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    allE2EContent += '\n' + content;
    if (
      /test\s*\(|it\s*\(|describe\s*\(|page\.|cy\./i.test(content) &&
      !/test\.skip|xit\s*\(/.test(content)
    ) {
      hasActiveTests = true;
    }
  }

  // CHECK 4: All tests skipped
  if (!hasActiveTests) {
    breaks.push({
      type: 'E2E_FLOW_NOT_TESTED',
      severity: 'high',
      file: path.relative(config.rootDir, e2eDir),
      line: 0,
      description: 'All E2E tests are skipped — no active end-to-end coverage',
      detail: 'Remove test.skip() and xit() to re-enable E2E tests',
    });
  }

  // CHECK 5: Core flow coverage
  for (const flow of CORE_FLOWS) {
    const covered = flow.patterns.some((re) => re.test(allE2EContent));
    if (!covered) {
      breaks.push({
        type: 'E2E_FLOW_NOT_TESTED',
        severity: flow.severity,
        file: path.relative(config.rootDir, e2eDir),
        line: 0,
        description: `No E2E test found for "${flow.name}" flow`,
        detail: `Add a Playwright/Cypress test that exercises the full ${flow.name} user journey`,
      });
    }
  }

  // CHECK 6: Checkout failure scenario
  const hasCheckoutSuccess = /checkout|payment|pagamento/i.test(allE2EContent);
  const hasCheckoutFailure = /fail|decline|reject|error|invalid.card|cartao.*invalido/i.test(
    allE2EContent,
  );
  if (hasCheckoutSuccess && !hasCheckoutFailure) {
    breaks.push({
      type: 'E2E_FLOW_NOT_TESTED',
      severity: 'high',
      file: path.relative(config.rootDir, e2eDir),
      line: 0,
      description: 'Checkout E2E tests only cover happy path — payment failure scenario not tested',
      detail: 'Add E2E test for: declined card, expired card, insufficient funds, 3DS failure',
    });
  }

  // CHECK 7: CI pipeline includes E2E
  const ciFiles = [
    path.join(config.rootDir, '.github', 'workflows'),
    path.join(config.rootDir, '.gitlab-ci.yml'),
    path.join(config.rootDir, 'railway.json'),
  ];
  let e2eInCI = false;
  for (const ciPath of ciFiles) {
    if (!fs.existsSync(ciPath)) {
      continue;
    }
    const ciContent =
      fs.existsSync(ciPath) && !fs.statSync(ciPath).isDirectory()
        ? fs.readFileSync(ciPath, 'utf8')
        : '';
    if (/e2e|playwright|cypress/i.test(ciContent)) {
      e2eInCI = true;
      break;
    }
  }
  if (!e2eInCI && e2eFiles.length > 0) {
    breaks.push({
      type: 'E2E_FLOW_NOT_TESTED',
      severity: 'high',
      file: '.github/workflows/',
      line: 0,
      description:
        'E2E tests exist but are not included in CI pipeline — they will never catch regressions',
      detail: 'Add an E2E test step to your GitHub Actions / CI workflow that runs on every PR',
    });
  }

  // TODO: Implement when infrastructure available
  // - Run E2E tests against staging environment
  // - Measure E2E test execution time
  // - Screenshot diff regression detection

  return breaks;
}
