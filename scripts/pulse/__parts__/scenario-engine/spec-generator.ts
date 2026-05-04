import { toPlaywrightHttpMethod } from '../../dynamic-reality-grammar';
import type {
  ScenarioCategory,
  ScenarioPrecondition,
  ScenarioRole,
  ScenarioStep,
} from '../../types.scenario-engine';
import { DEFAULT_STEP_TIMEOUT } from './constants';

function generatePlaywrightSpec(scenario: {
  id: string;
  name: string;
  role: ScenarioRole;
  category: ScenarioCategory;
  steps: ScenarioStep[];
  preconditions: ScenarioPrecondition[];
}): string {
  const lines: string[] = [];
  lines.push(`// PULSE auto-generated Playwright spec — ${scenario.id}`);
  lines.push(`// Category: ${scenario.category}  Role: ${scenario.role}`);
  lines.push(`// Generated at: ${new Date().toISOString()}`);
  lines.push(`// Status: generated (pending staging execution)`);
  lines.push('');

  lines.push(`import { test, expect } from '@playwright/test';`);
  lines.push('');

  const fixtures = scenario.preconditions
    .filter((p) => p.fixture)
    .map((p) => p.fixture)
    .join(', ');
  const fixtureComment = fixtures ? ` // requires: ${fixtures}` : '';

  lines.push(`test.describe('${scenario.name}', () => {`);
  lines.push(`  test('${scenario.id}', async ({ page, request }) => {${fixtureComment}`);

  for (const step of scenario.steps) {
    switch (step.kind) {
      case 'login':
        lines.push(`    // Step ${step.order}: ${step.description}`);
        lines.push(`    await page.goto('${step.target}');`);
        lines.push(
          `    await page.fill('input[name="email"]', process.env.TEST_EMAIL || 'pulse-test@example.invalid');`,
        );
        lines.push(
          `    await page.fill('input[name="password"]', process.env.TEST_PASSWORD || 'pulse-test-password');`,
        );
        lines.push(`    await page.click('button[type="submit"]');`);
        lines.push(`    await page.waitForURL('**/main/**', { timeout: ${step.timeout} });`);
        break;

      case 'navigate':
        lines.push(`    // Step ${step.order}: ${step.description}`);
        lines.push(`    await page.goto('${step.target}');`);
        lines.push(`    await page.waitForLoadState('networkidle', { timeout: ${step.timeout} });`);
        break;

      case 'click':
        lines.push(`    // Step ${step.order}: ${step.description}`);
        lines.push(`    await page.click('${step.target}');`);
        lines.push(`    await page.waitForTimeout(1000);`);
        break;

      case 'type':
        lines.push(`    // Step ${step.order}: ${step.description}`);
        lines.push(`    await page.fill('${step.target}', 'pulse-test-value');`);
        lines.push(
          `    await expect(page.locator('${step.target}')).toHaveValue('pulse-test-value');`,
        );
        break;

      case 'submit':
        lines.push(`    // Step ${step.order}: ${step.description}`);
        lines.push(`    await page.click('button[type="submit"]');`);
        lines.push(`    await page.waitForLoadState('networkidle', { timeout: ${step.timeout} });`);
        break;

      case 'api_call':
        lines.push(`    // Step ${step.order}: ${step.description}`);
        lines.push(
          `    const apiRes${step.order} = await request.${getHttpMethodForStep(step)}('${getApiPathForStep(step)}', {`,
        );
        lines.push(`      data: { /* pulse-test-payload */ },`);
        lines.push(`      failOnStatusCode: false,`);
        lines.push(`    });`);
        lines.push(`    expect(apiRes${step.order}.status()).toBe(200);`);
        break;

      case 'assert':
        lines.push(`    // Step ${step.order}: ${step.description}`);
        lines.push(
          `    await expect(page.locator('body')).not.toContainText('error', { timeout: ${step.timeout} });`,
        );
        break;

      case 'seed_db':
        lines.push(`    // Step ${step.order}: ${step.description}`);
        lines.push(`    // DB seed via API or direct fixture — executed by harness`);
        break;

      case 'cleanup':
        lines.push(`    // Step ${step.order}: ${step.description}`);
        lines.push(`    // Cleanup test data — executed by harness teardown`);
        break;

      case 'wait':
        lines.push(`    // Step ${step.order}: ${step.description}`);
        lines.push(`    await page.waitForTimeout(${step.timeout});`);
        break;

      default:
        lines.push(`    // Step ${step.order}: ${step.description}`);
        lines.push(`    await page.waitForTimeout(${DEFAULT_STEP_TIMEOUT});`);
        break;
    }
  }

  lines.push(`  });`);
  lines.push(`});`);
  lines.push('');

  return lines.join('\n');
}

function getHttpMethodForStep(step: ScenarioStep): string {
  const method = step.target.trim().split(/\s+/)[0]?.toUpperCase();
  return toPlaywrightHttpMethod(method);
}

function getApiPathForStep(step: ScenarioStep): string {
  const [, ...pathParts] = step.target.trim().split(/\s+/);
  const apiPath = pathParts.join(' ');
  return apiPath.startsWith('/') ? apiPath : step.target;
}

export { generatePlaywrightSpec, getHttpMethodForStep, getApiPathForStep };
