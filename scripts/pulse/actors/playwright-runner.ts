import * as path from 'path';
import { spawnSync } from 'child_process';
import { safeJoin } from '../safe-path';
import { pathExists } from '../safe-fs';
import type { PulseActorEvidence, PulseManifestScenarioSpec, PulseScenarioResult } from '../types';
import { buildScenarioResult } from './scenario-result';
import type { RunSyntheticActorsInput } from './types';

/** Resolve a Playwright spec path relative to project root or e2e dir. */
export function resolvePlaywrightSpec(rootDir: string, specPath: string): string | null {
  const candidatePaths = [safeJoin(rootDir, specPath), safeJoin(rootDir, 'e2e', specPath)];
  for (const candidate of candidatePaths) {
    if (pathExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

/** Execute a Playwright-backed scenario and return its PulseScenarioResult. */
export function executePlaywrightScenario(
  input: RunSyntheticActorsInput,
  scenario: PulseManifestScenarioSpec,
  actorArtifact: PulseActorEvidence['actorKind'],
): PulseScenarioResult {
  const startedAt = Date.now();
  const e2eDir = safeJoin(input.rootDir, 'e2e');
  if (!pathExists(e2eDir)) {
    return buildScenarioResult(scenario, actorArtifact, {
      status: 'checker_gap',
      executed: false,
      failureClass: 'checker_gap',
      summary: 'E2E directory is missing; Playwright-backed synthetic scenario cannot run.',
      durationMs: Date.now() - startedAt,
    });
  }
  const specs = scenario.playwrightSpecs
    .map((specPath) => resolvePlaywrightSpec(input.rootDir, specPath))
    .filter((value): value is string => Boolean(value));
  if (specs.length !== scenario.playwrightSpecs.length) {
    return buildScenarioResult(scenario, actorArtifact, {
      status: 'checker_gap',
      executed: false,
      failureClass: 'checker_gap',
      summary: `Playwright spec files are missing for scenario ${scenario.id}.`,
      durationMs: Date.now() - startedAt,
      metrics: {
        expectedSpecs: scenario.playwrightSpecs.length,
        foundSpecs: specs.length,
      },
    });
  }
  const relativeSpecs = specs.map((specPath) => path.relative(e2eDir, specPath));
  const command = ['playwright', 'test', ...relativeSpecs, '--reporter=json'];
  const result = spawnSync('npx', command, {
    cwd: e2eDir,
    encoding: 'utf8',
    timeout: scenario.timeWindowModes.includes('soak') ? 20 * 60 * 1000 : 5 * 60 * 1000,
    env: {
      ...process.env,
      E2E_API_URL: input.runtimeEvidence.backendUrl || process.env.E2E_API_URL,
      E2E_FRONTEND_URL: input.runtimeEvidence.frontendUrl || process.env.E2E_FRONTEND_URL,
      E2E_APP_URL:
        process.env.E2E_APP_URL ||
        input.runtimeEvidence.frontendUrl ||
        process.env.E2E_FRONTEND_URL,
      E2E_AUTH_URL:
        process.env.E2E_AUTH_URL ||
        input.runtimeEvidence.frontendUrl ||
        process.env.E2E_FRONTEND_URL,
      E2E_PAY_URL:
        process.env.E2E_PAY_URL ||
        input.runtimeEvidence.frontendUrl ||
        process.env.E2E_FRONTEND_URL,
      E2E_WORKER_URL: process.env.E2E_WORKER_URL || process.env.PULSE_WORKER_URL,
    },
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) {
    return buildScenarioResult(scenario, actorArtifact, {
      status: 'missing_evidence',
      executed: false,
      failureClass: 'missing_evidence',
      summary: `Playwright scenario ${scenario.id} could not execute: ${result.error.message}`,
      durationMs: Date.now() - startedAt,
    });
  }
  let stats: Record<string, number> = {};
  try {
    const parsed = JSON.parse(result.stdout || '{}') as { stats?: Record<string, number> };
    stats = parsed.stats || {};
  } catch {
    stats = {};
  }
  if (result.status === 0) {
    return buildScenarioResult(scenario, actorArtifact, {
      status: 'passed',
      executed: true,
      requested: true,
      smokeExecuted: scenario.providerMode === 'real_smoke' || scenario.providerMode === 'hybrid',
      worldStateConverged: true,
      summary: `Playwright scenario ${scenario.id} passed.`,
      specsExecuted: relativeSpecs,
      durationMs: Date.now() - startedAt,
      metrics: {
        expected: stats.expected || 0,
        skipped: stats.skipped || 0,
        duration: stats.duration || 0,
      },
    });
  }
  return buildScenarioResult(scenario, actorArtifact, {
    status: 'failed',
    executed: true,
    requested: true,
    smokeExecuted: scenario.providerMode === 'real_smoke' || scenario.providerMode === 'hybrid',
    failureClass: 'product_failure',
    summary: `Playwright scenario ${scenario.id} failed with exit code ${result.status || 1}.`,
    specsExecuted: relativeSpecs,
    durationMs: Date.now() - startedAt,
    metrics: {
      expected: stats.expected || 0,
      unexpected: stats.unexpected || 0,
      flaky: stats.flaky || 0,
      skipped: stats.skipped || 0,
      duration: stats.duration || 0,
      exitCode: result.status || 1,
    },
  });
}
