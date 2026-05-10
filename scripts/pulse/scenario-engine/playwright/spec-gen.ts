// PULSE Wave 5 — Playwright Spec & Evidence Generator
// Sub-part: spec generation, evidence links, preconditions, step builder

import { deriveHttpStatusFromObservedCatalog } from '../../dynamic-reality-kernel/catalog-arithmetic';
import {
  isObservedMutatingMethod,
  toPlaywrightHttpMethod,
} from '../../dynamic-reality-grammar';
import type { BehaviorNode } from '../../types.behavior-graph';
import type { EntityLifecycle } from '../../types.dataflow-engine';
import type { HarnessTarget } from '../../types.execution-harness';
import type {
  ScenarioCategory,
  ScenarioEvidenceLink,
  ScenarioPrecondition,
  ScenarioRole,
  ScenarioStep,
  ScenarioStepKind,
} from '../../types.scenario-engine';
import {
  _scale,
  _unit,
  _zero,
  DEFAULT_STEP_TIMEOUT,
  LONG_STEP_TIMEOUT,
  getCapabilitiesForSurface,
  getHttpDecorator,
  extractRoutePattern,
  getHarnessFixtures,
  getSurface,
  tokenizeScenarioText,
} from '../queries';
import type { ScenarioBuildContext } from '../queries';

// ─── Playwright Spec Generation ──────────────────────────────────────────
export function generatePlaywrightSpec(scenario: {
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
        lines.push(`    await page.waitForTimeout(${_unit * _scale});`);
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
        lines.push(
          `    expect(apiRes${step.order}.status()).toBe(${deriveHttpStatusFromObservedCatalog('OK')});`,
        );
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

export function getHttpMethodForStep(step: ScenarioStep): string {
  const method = step.target.trim().split(/\s+/)[0]?.toUpperCase();
  return toPlaywrightHttpMethod(method);
}

export function getApiPathForStep(step: ScenarioStep): string {
  const [, ...pathParts] = step.target.trim().split(/\s+/);
  const apiPath = pathParts.join(' ');
  return apiPath.startsWith('/') ? apiPath : step.target;
}

// ─── Evidence Links ──────────────────────────────────────────────────────
export function buildEvidenceLinks(
  steps: ScenarioStep[],
  endpoints: BehaviorNode[],
  entity: EntityLifecycle | null,
): ScenarioEvidenceLink[] {
  const links: ScenarioEvidenceLink[] = [];

  for (const step of steps) {
    const link: ScenarioEvidenceLink = {};

    if (step.kind === 'navigate' || step.kind === 'click') {
      link.ui = step.target;
    }

    if (step.kind === 'api_call' && endpoints.length > 0) {
      const ep = endpoints[0];
      link.api = `${getHttpDecorator(ep)} ${extractRoutePattern(ep)}`;
    }

    if (step.kind === 'assert' && entity) {
      link.dbModel = entity.model;
      link.dbOperation = entity.createdBy.length > _zero ? 'create' : 'read';
    }

    if (step.kind === 'submit' || step.kind === 'api_call') {
      link.runtimeSignal = 'log.info | trace.span | metric.increment';
    }

    if (link.ui || link.api || link.dbModel || link.runtimeSignal) {
      links.push(link);
    }
  }

  return links;
}

// ─── Precondition Builders ───────────────────────────────────────────────
export function buildPreconditions(
  _category: ScenarioCategory,
  endpoints: BehaviorNode[],
  harnessTargets: HarnessTarget[],
  entity: EntityLifecycle | null,
): ScenarioPrecondition[] {
  const preconditions: ScenarioPrecondition[] = [];

  const needsRequestContext = endpoints.some((endpoint) =>
    endpoint.inputs.some((input) => input.kind === 'context' || input.kind === 'headers'),
  );
  if (needsRequestContext) {
    preconditions.push({
      description: 'Request context is required by discovered endpoint input metadata',
      workspaceState: 'runtime-context',
      fixture: 'pulse-auth-token',
    });
  }

  const fixtures = getHarnessFixtures(harnessTargets);
  for (const f of fixtures) {
    if (!preconditions.some((p) => p.fixture === f)) {
      preconditions.push({
        description: `Harness fixture required: ${f}`,
        fixture: f,
      });
    }
  }

  if (entity) {
    preconditions.push({
      description: `Entity '${entity.model}' exists in schema (migration applied)`,
      fixture: 'pulse-test-env',
    });
  }

  return preconditions;
}

// ─── Dynamic Step Generation ─────────────────────────────────────────────
export function buildStep(
  order: number,
  kind: ScenarioStepKind,
  description: string,
  target: string,
  expectedResult: string,
  timeout: number,
): ScenarioStep {
  return { order, kind, description, target, expectedResult, timeout };
}

export interface DynamicScenarioPlan {
  needsLogin: boolean;
  needsActionClick: boolean;
  needsSubmit: boolean;
  needsAsyncWait: boolean;
  needsCleanup: boolean;
  needsSeedData: boolean;
  minInputSteps: number;
}
