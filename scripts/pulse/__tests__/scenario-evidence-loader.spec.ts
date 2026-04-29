/**
 * Scenario Evidence Loader Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { loadScenarioEvidenceFromDisk } from '../scenario-evidence-loader';

describe('scenario-evidence-loader', () => {
  const testRootDir = '/tmp/test-pulse-evidence';
  const evidenceDir = path.join(testRootDir, '.pulse/current');

  beforeEach(() => {
    if (!fs.existsSync(evidenceDir)) {
      fs.mkdirSync(evidenceDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testRootDir)) {
      fs.rmSync(testRootDir, { recursive: true });
    }
  });

  it('should load fresh evidence file', () => {
    const freshEvidence = {
      actorKind: 'customer',
      declared: ['scenario-1'],
      executed: ['scenario-1'],
      missing: [],
      passed: ['scenario-1'],
      failed: [],
      summary: 'test',
      results: [
        {
          scenarioId: 'scenario-1',
          status: 'passed',
          executed: true,
          critical: true,
        },
      ],
    };

    fs.writeFileSync(
      path.join(evidenceDir, 'PULSE_CUSTOMER_EVIDENCE.json'),
      JSON.stringify(freshEvidence),
    );

    const result = loadScenarioEvidenceFromDisk(testRootDir);

    expect(result.customer).not.toBeNull();
    expect(result.customer?.passed).toContain('scenario-1');
    expect(result.customer?.results).toHaveLength(1);
    expect(result.customer?.results[0].truthMode).toBe('observed-from-disk');
    expect(result.summary).toContain('customer: fresh');
  });

  it('should detect stale evidence (>24h old)', () => {
    const staleEvidence = {
      actorKind: 'operator',
      declared: ['scenario-2'],
      executed: [],
      missing: ['scenario-2'],
      passed: [],
      failed: [],
      summary: 'test',
      results: [
        {
          scenarioId: 'scenario-2',
          status: 'missing_evidence',
          executed: false,
          critical: false,
        },
      ],
    };

    const filepath = path.join(evidenceDir, 'PULSE_OPERATOR_EVIDENCE.json');
    fs.writeFileSync(filepath, JSON.stringify(staleEvidence));

    // Set mtime to 25 hours ago
    const past = new Date(Date.now() - 25 * 60 * 60 * 1000);
    fs.utimesSync(filepath, past, past);

    const result = loadScenarioEvidenceFromDisk(testRootDir);

    expect(result.operator).not.toBeNull();
    expect(result.operator?.results[0].truthMode).toBe('inferred');
    expect(result.summary).toContain('operator: stale');
  });

  it('should handle missing evidence files gracefully', () => {
    const result = loadScenarioEvidenceFromDisk(testRootDir);

    expect(result.customer).toBeNull();
    expect(result.operator).toBeNull();
    expect(result.admin).toBeNull();
    expect(result.soak).toBeNull();
    expect(result.summary).toContain('customer: no file');
    expect(result.summary).toContain('operator: no file');
    expect(result.summary).toContain('admin: no file');
    expect(result.summary).toContain('soak: no file');
  });

  it('should keep contract actor files even when manifest discovery is narrower', () => {
    fs.writeFileSync(
      path.join(testRootDir, 'pulse.manifest.json'),
      JSON.stringify({
        actorProfiles: [
          {
            id: 'buyer',
            kind: 'customer',
            description: 'buyer',
            moduleFocus: [],
            defaultTimeWindowModes: ['total'],
          },
        ],
        scenarioSpecs: [
          {
            id: 'scenario-1',
            actorKind: 'customer',
            scenarioKind: 'single-session',
            critical: true,
            moduleKeys: [],
            routePatterns: [],
            flowSpecs: [],
            flowGroups: [],
            playwrightSpecs: [],
            runtimeProbes: [],
            requiresBrowser: true,
            requiresPersistence: false,
            asyncExpectations: [],
            providerMode: 'sandbox',
            timeWindowModes: ['total'],
            runner: 'derived',
            executionMode: 'derived',
            worldStateKeys: [],
            requiredArtifacts: ['PULSE_CUSTOMER_EVIDENCE.json'],
            notes: 'test',
          },
        ],
      }),
    );

    const result = loadScenarioEvidenceFromDisk(testRootDir);

    expect(result.customer).toBeNull();
    expect(result.summary).toContain('customer: no file');
    expect(result.summary).toContain('operator: no file');
    expect(result.summary).toContain('admin: no file');
    expect(result.summary).toContain('soak: no file');
  });

  it('should normalize stale skipped evidence without upgrading it to fresh execution', () => {
    const staleEvidence = {
      actorKind: 'operator',
      declared: ['scenario-skipped'],
      executed: [],
      missing: ['scenario-skipped'],
      passed: [],
      failed: [],
      summary: 'old skipped evidence',
      results: [
        {
          scenarioId: 'scenario-skipped',
          actorKind: 'operator',
          scenarioKind: 'single-session',
          status: 'not_run',
          executed: false,
          requested: false,
          critical: false,
        },
      ],
    };
    const filepath = path.join(evidenceDir, 'PULSE_OPERATOR_EVIDENCE.json');
    fs.writeFileSync(filepath, JSON.stringify(staleEvidence));
    const past = new Date(Date.now() - 25 * 60 * 60 * 1000);
    fs.utimesSync(filepath, past, past);

    const result = loadScenarioEvidenceFromDisk(testRootDir);
    const rewritten = JSON.parse(fs.readFileSync(filepath, 'utf8')) as {
      summary?: string;
      results?: Array<{ status?: string; executed?: boolean }>;
    };

    expect(result.operator).not.toBeNull();
    expect(result.operator?.results[0].status).toBe('skipped');
    expect(result.operator?.results[0].executed).toBe(false);
    expect(result.operator?.results[0].truthMode).toBe('inferred');
    expect(result.summary).toContain('operator: stale');
    expect(rewritten.summary).toBe('old skipped evidence');
    expect(rewritten.results?.[0]).toMatchObject({ status: 'not_run', executed: false });
  });

  it('should handle invalid JSON gracefully', () => {
    fs.writeFileSync(path.join(evidenceDir, 'PULSE_ADMIN_EVIDENCE.json'), 'not valid json');

    const result = loadScenarioEvidenceFromDisk(testRootDir);

    expect(result.admin).toBeNull();
    expect(result.summary).toContain('admin: parse error');
  });

  it('should validate results array presence', () => {
    const invalidEvidence = {
      actorKind: 'soak',
      declared: [],
      executed: [],
      missing: [],
      passed: [],
      failed: [],
      summary: 'test',
      // missing results array
    };

    fs.writeFileSync(
      path.join(evidenceDir, 'PULSE_SOAK_EVIDENCE.json'),
      JSON.stringify(invalidEvidence),
    );

    const result = loadScenarioEvidenceFromDisk(testRootDir);

    expect(result.soak).toBeNull();
    expect(result.summary).toContain('soak: invalid structure');
  });
});
