import type {
  HarnessEvidence,
  HarnessExecutionResult,
  HarnessTarget,
} from '../types.execution-harness';
import { safeJoin } from '../safe-path';
import { pathExists, readJsonFile } from '../safe-fs';
import {
  DB_SEED_FIXTURE,
  harnessArtifactPath,
  QUEUE_MESSAGE_FIXTURE,
  WEBHOOK_KIND_LABEL,
} from './grammar';
import {
  camelToKebab,
  CANNOT_EXECUTE_FEASIBILITY,
  EXECUTABLE_FEASIBILITY,
  formatTimestamp,
  NEEDS_STAGING_FEASIBILITY,
  normalizeHarnessExecutionResult,
} from './helpers';

// ─── Fixture Data Structure Builders ─────────────────────────────────────────

/**
 * Build fixture data structures for common scenarios without connecting to
 * live infrastructure. These are blueprint data definitions consumed by
 * test runners when they actually execute.
 */
export function buildFixtureDataStructures(targets: HarnessTarget[]): Record<string, unknown> {
  const dbModels = new Set<string>();
  const queueNames = new Set<string>();
  const webhookEndpoints: Array<{ locator: string; targetId: string }> = [];

  for (const t of targets) {
    for (const f of t.fixtures) {
      if (f.kind === DB_SEED_FIXTURE && f.data && typeof f.data === 'object') {
        const data = f.data as Record<string, unknown>;
        if (Array.isArray(data.requiredModels)) {
          for (const m of data.requiredModels) {
            dbModels.add(String(m));
          }
        }
      }
      if (f.kind === QUEUE_MESSAGE_FIXTURE && f.data && typeof f.data === 'object') {
        const data = f.data as Record<string, unknown>;
        if (typeof data.queueName === 'string') {
          queueNames.add(data.queueName);
        }
      }
    }
    if (t.kind === WEBHOOK_KIND_LABEL && t.routePattern) {
      webhookEndpoints.push({ locator: t.routePattern, targetId: t.targetId });
    }
  }

  return {
    dbSeeds: [...dbModels].map((model) => ({
      model,
      table: camelToKebab(model),
      ['seedRecords']: 5,
      ['defaultFields']: { id: 'uuid-string', createdAt: 'Date', updatedAt: 'Date' },
    })),
    queueFixtures: [...queueNames].map((name) => ({
      queueName: name,
      sampleJob: {
        id: 'pulse-test-job-id',
        data: { testMode: true, pulseRun: 'harness-discovery' },
        opts: { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
      },
    })),
    webhookFixtures: webhookEndpoints.map((w) => ({
      path: w.locator,
      targetId: w.targetId,
      samplePayload: {
        ['event']: 'pulse.test.event',
        timestamp: formatTimestamp(),
        data: { id: 'pulse-test-id', testMode: true },
      },
      signatureHeader: 'x-webhook-signature',
    })),
    authFixtures: {
      testTokenPayload: {
        subject: '__pulse_subject__',
        context: '__pulse_context__',
        claims: {},
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
    },
  };
}

// ─── Feasibility Summary Builder ─────────────────────────────────────────────

export function buildFeasibilitySummary(targets: HarnessTarget[]): {
  executableTargets: number;
  needsStagingTargets: number;
  cannotExecuteTargets: number;
  generatedTestCount: number;
} {
  let executableTargets = 0;
  let needsStagingTargets = 0;
  let cannotExecuteTargets = 0;
  let generatedTestsTotal = 0;

  for (const t of targets) {
    switch (t.feasibility) {
      case EXECUTABLE_FEASIBILITY:
        executableTargets++;
        break;
      case NEEDS_STAGING_FEASIBILITY:
        needsStagingTargets++;
        break;
      case CANNOT_EXECUTE_FEASIBILITY:
        cannotExecuteTargets++;
        break;
    }
    generatedTestsTotal += t.generatedTests.length;
  }

  return {
    executableTargets,
    needsStagingTargets,
    cannotExecuteTargets,
    generatedTestCount: generatedTestsTotal,
  };
}

/**
 * Load previously stored harness execution results from disk.
 *
 * Reads the harness evidence artifact at `.pulse/current/PULSE_HARNESS_EVIDENCE.json`
 * and returns the embedded results. Returns an empty array if no prior results exist.
 *
 * @param rootDir - Repository root directory
 * @returns Array of previously stored harness execution results
 */
export function loadHarnessResults(rootDir: string): HarnessExecutionResult[] {
  const harnessEvidenceFile = safeJoin(rootDir, harnessArtifactPath());

  if (!pathExists(harnessEvidenceFile)) {
    return [];
  }

  try {
    const evidence = readJsonFile<HarnessEvidence>(harnessEvidenceFile);
    return Array.isArray(evidence.results)
      ? evidence.results.map(normalizeHarnessExecutionResult)
      : [];
  } catch {
    return [];
  }
}
