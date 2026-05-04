import { safeJoin } from '../../safe-path';
import { pathExists, readJsonFile } from '../../safe-fs';
import type {
  HarnessEvidence,
  HarnessExecutionResult,
  HarnessTarget,
} from '../../types.execution-harness';
import { normalizeHarnessExecutionResult, camelToKebab, formatTimestamp } from './helpers';
import { harnessArtifactPath } from './grammar';

export function buildFixtureDataStructures(targets: HarnessTarget[]): Record<string, unknown> {
  const dbModels = new Set<string>();
  const queueNames = new Set<string>();
  const webhookEndpoints: Array<{ locator: string; targetId: string }> = [];

  for (const t of targets) {
    for (const f of t.fixtures) {
      if (f.kind === 'db_seed' && f.data && typeof f.data === 'object') {
        const data = f.data as Record<string, unknown>;
        if (Array.isArray(data.requiredModels)) {
          for (const m of data.requiredModels) {
            dbModels.add(String(m));
          }
        }
      }
      if (f.kind === 'queue_message' && f.data && typeof f.data === 'object') {
        const data = f.data as Record<string, unknown>;
        if (typeof data.queueName === 'string') {
          queueNames.add(data.queueName);
        }
      }
    }
    if (t.kind === 'webhook' && t.routePattern) {
      webhookEndpoints.push({ locator: t.routePattern, targetId: t.targetId });
    }
  }

  return {
    dbSeeds: [...dbModels].map((model) => ({
      model,
      table: camelToKebab(model),
      seedRecords: 5,
      defaultFields: { id: 'uuid-string', createdAt: 'Date', updatedAt: 'Date' },
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
        event: 'pulse.test.event',
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
