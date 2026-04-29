import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { buildArtifactRegistry } from '../artifact-registry';
import { buildGitNexusSnapshot, buildPulseContextFabricBundle } from '../context-broadcast';
import type { PulseConvergencePlan, PulseConvergenceUnit } from '../types';

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-context-'));
  fs.mkdirSync(path.join(root, '.beads'), { recursive: true });
  fs.writeFileSync(path.join(root, '.beads', 'issues.jsonl'), '{"id":"BD-1"}\n', 'utf8');
  fs.mkdirSync(path.join(root, 'ops'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'ops', 'protected-governance-files.json'),
    JSON.stringify({
      protectedExact: ['AGENTS.md', 'package.json'],
      protectedPrefixes: ['ops/', 'scripts/ops/', '.github/workflows/'],
    }),
    'utf8',
  );
  return root;
}

function makeUnit(
  index: number,
  relatedFiles: string[],
  affectedCapabilityIds: string[] = [`cap-${index}`],
): PulseConvergenceUnit {
  return {
    id: `unit-${index}`,
    order: index,
    priority: 'P0',
    kind: 'capability',
    status: 'open',
    source: 'pulse',
    executionMode: 'ai_safe',
    ownerLane: 'platform',
    riskLevel: 'low',
    evidenceMode: 'observed',
    confidence: 'high',
    productImpact: 'material',
    title: `Unit ${index}`,
    summary: `Unit ${index} summary`,
    visionDelta: `Unit ${index} delta`,
    targetState: `Unit ${index} target`,
    failureClass: 'unknown',
    actorKinds: [],
    gateNames: ['pulseSelfTrustPass'],
    scenarioIds: [],
    moduleKeys: [],
    routePatterns: [],
    flowIds: [],
    affectedCapabilityIds,
    affectedFlowIds: [],
    asyncExpectations: [],
    breakTypes: [],
    artifactPaths: ['PULSE_CERTIFICATE.json'],
    relatedFiles,
    validationArtifacts: ['PULSE_CERTIFICATE.json'],
    exitCriteria: ['score>=66'],
  };
}

function makePlan(units: PulseConvergenceUnit[]): PulseConvergencePlan {
  return {
    generatedAt: '2026-04-28T12:00:00.000Z',
    commitSha: 'HEAD',
    status: 'NOT_CERTIFIED',
    humanReplacementStatus: 'NOT_READY',
    blockingTier: 2,
    summary: {
      totalUnits: units.length,
      scenarioUnits: 0,
      securityUnits: 0,
      staticUnits: 0,
      runtimeUnits: 0,
      changeUnits: 0,
      dependencyUnits: 0,
      scopeUnits: 0,
      gateUnits: 0,
      humanRequiredUnits: 0,
      observationOnlyUnits: 0,
      priorities: { P0: units.length, P1: 0, P2: 0, P3: 0 },
      failingGates: ['pulseSelfTrustPass'],
      pendingAsyncExpectations: [],
    },
    queue: units,
  };
}

describe('PULSE context broadcast and worker leases', () => {
  it('builds ten worker envelopes with disjoint mutable ownership', () => {
    const rootDir = makeTempRoot();
    const units = Array.from({ length: 10 }, (_, index) =>
      makeUnit(index, [`scripts/pulse/subsystem-${index}.ts`]),
    );
    const bundle = buildPulseContextFabricBundle({
      rootDir,
      registry: buildArtifactRegistry(rootDir),
      convergencePlan: makePlan(units),
      runId: 'run-1',
      directiveContent: '{"ok":true}',
      certificateContent: '{"status":"NOT_CERTIFIED"}',
    });

    expect(bundle.broadcast.workers).toHaveLength(10);
    expect(bundle.leases.ownershipConflictPass).toBe(true);
    expect(bundle.leases.protectedFilesForbiddenPass).toBe(true);
    expect(bundle.broadcast.workers.every((worker) => worker.contextDigest)).toBe(true);

    const ownedFiles = bundle.broadcast.workers.flatMap((worker) => worker.ownedFiles);
    expect(new Set(ownedFiles).size).toBe(ownedFiles.length);
  });

  it('moves overlapping mutable files to read-only for later workers', () => {
    const rootDir = makeTempRoot();
    const bundle = buildPulseContextFabricBundle({
      rootDir,
      registry: buildArtifactRegistry(rootDir),
      convergencePlan: makePlan([
        makeUnit(1, ['scripts/pulse/shared.ts']),
        makeUnit(2, ['scripts/pulse/shared.ts']),
      ]),
      runId: 'run-2',
      directiveContent: '{"ok":true}',
      certificateContent: '{"status":"NOT_CERTIFIED"}',
    });

    const first = bundle.broadcast.workers[0];
    const second = bundle.broadcast.workers[1];
    expect(first.ownedFiles).toContain('scripts/pulse/shared.ts');
    expect(second.ownedFiles).not.toContain('scripts/pulse/shared.ts');
    expect(second.readOnlyFiles).toContain('scripts/pulse/shared.ts');
    expect(bundle.leases.ownershipConflictPass).toBe(true);
  });

  it('forbids protected governance files and blocks stale context explicitly', () => {
    const rootDir = makeTempRoot();
    const bundle = buildPulseContextFabricBundle({
      rootDir,
      registry: buildArtifactRegistry(rootDir),
      convergencePlan: makePlan([makeUnit(1, ['AGENTS.md', 'scripts/pulse/context-broadcast.ts'])]),
      runId: 'run-3',
      directiveContent: '{"ok":true}',
      certificateContent: '{"status":"NOT_CERTIFIED"}',
    });

    const worker = bundle.broadcast.workers[0];
    expect(worker.forbiddenFiles).toContain('AGENTS.md');
    expect(worker.ownedFiles).not.toContain('AGENTS.md');
    expect(worker.readOnlyFiles).toContain('AGENTS.md');
    expect(bundle.delta.staleContextBlocksExecution).toBe(true);
    expect(bundle.delta.blockers).toContain('gitnexus:missing');
  });

  it('normalizes lease paths and excludes invalid protected ownership', () => {
    const rootDir = makeTempRoot();
    const rootAbsolute = path.join(rootDir, 'backend', 'src', 'pulse', 'core.ts');
    const protectedAbsolute = path.join(rootDir, '.github', 'workflows', 'ci-cd.yml');
    const bundle = buildPulseContextFabricBundle({
      rootDir,
      registry: buildArtifactRegistry(rootDir),
      convergencePlan: makePlan([
        makeUnit(1, [
          rootAbsolute,
          'backend/src/pulse/core.ts (3)',
          '/tmp/outside-pulse.ts',
          protectedAbsolute,
          'scripts/ops/check-governance-boundary.mjs',
        ]),
      ]),
      runId: 'run-4',
      directiveContent: '{"ok":true}',
      certificateContent: '{"status":"NOT_CERTIFIED"}',
    });

    const worker = bundle.broadcast.workers[0];
    expect(worker.ownedFiles).toEqual(['backend/src/pulse/core.ts']);
    expect(worker.ownedFiles.some((filePath) => path.isAbsolute(filePath))).toBe(false);
    expect(worker.ownedFiles.some((filePath) => /\s+\(\d+\)$/.test(filePath))).toBe(false);
    expect(worker.readOnlyFiles).toContain('scripts/ops/check-governance-boundary.mjs');
    expect(bundle.leases.protectedFilesForbiddenPass).toBe(true);
  });

  it('treats GitNexus meta.json lastCommit as a fresh local index', () => {
    const rootDir = makeTempRoot();
    execFileSync('git', ['init', '-q'], { cwd: rootDir });
    execFileSync('git', ['config', 'user.name', 'PULSE Test'], { cwd: rootDir });
    execFileSync('git', ['config', 'user.email', 'pulse-test@local'], { cwd: rootDir });
    fs.writeFileSync(path.join(rootDir, 'README.md'), '# test\n', 'utf8');
    execFileSync('git', ['add', 'README.md'], { cwd: rootDir });
    execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'baseline'], {
      cwd: rootDir,
    });
    const head = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: rootDir,
      encoding: 'utf8',
    }).trim();
    fs.mkdirSync(path.join(rootDir, '.gitnexus'), { recursive: true });
    fs.writeFileSync(
      path.join(rootDir, '.gitnexus', 'meta.json'),
      JSON.stringify({ lastCommit: head, indexedAt: '2026-04-28T12:00:00.000Z' }),
      'utf8',
    );

    const snapshot = buildGitNexusSnapshot(rootDir, '2026-04-28T12:01:00.000Z');

    expect(snapshot.status).toBe('ready');
    expect(snapshot.ref).toContain(head);
  });
});
