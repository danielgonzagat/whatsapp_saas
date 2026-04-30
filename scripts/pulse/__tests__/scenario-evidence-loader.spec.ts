/**
 * Scenario Evidence Loader Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { loadScenarioEvidenceFromDisk } from '../scenario-evidence-loader';

describe('scenario-evidence-loader', () => {
  const testRootDir = '/tmp/test-pulse-evidence';
  const evidenceDir = path.join(testRootDir, '.pulse/current');

  function recentIso(offsetMs = 0): string {
    return new Date(Date.now() - offsetMs).toISOString();
  }

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
          command: 'npx playwright test scenario-1.spec.ts',
          exitCode: 0,
          startedAt: recentIso(1000),
          finishedAt: recentIso(),
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

  it('should keep fresh not_run evidence inferred instead of observed execution', () => {
    fs.writeFileSync(
      path.join(evidenceDir, 'PULSE_CUSTOMER_EVIDENCE.json'),
      JSON.stringify({
        actorKind: 'customer',
        declared: ['scenario-plan-only'],
        executed: [],
        missing: ['scenario-plan-only'],
        passed: [],
        failed: [],
        summary: 'plan generated without runtime execution',
        results: [
          {
            scenarioId: 'scenario-plan-only',
            status: 'not_run',
            executed: false,
            critical: true,
            startedAt: recentIso(1000),
            finishedAt: recentIso(),
          },
        ],
      }),
    );

    const result = loadScenarioEvidenceFromDisk(testRootDir);

    expect(result.customer?.results[0]).toEqual(
      expect.objectContaining({
        status: 'skipped',
        executed: false,
        truthMode: 'inferred',
      }),
    );
    expect(result.customer?.results[0].machineWork?.terminalProofReason).toContain(
      'has no runtime-observed terminal proof',
    );
  });

  it('should require fresh execution timestamps before observing disk evidence', () => {
    fs.writeFileSync(
      path.join(evidenceDir, 'PULSE_CUSTOMER_EVIDENCE.json'),
      JSON.stringify({
        actorKind: 'customer',
        declared: ['scenario-old-finish'],
        executed: ['scenario-old-finish'],
        missing: [],
        passed: ['scenario-old-finish'],
        failed: [],
        summary: 'terminal status with stale execution timestamp',
        results: [
          {
            scenarioId: 'scenario-old-finish',
            status: 'passed',
            executed: true,
            critical: true,
            command: 'npx playwright test scenario-old-finish.spec.ts',
            exitCode: 0,
            startedAt: recentIso(26 * 60 * 60 * 1000),
            finishedAt: recentIso(25 * 60 * 60 * 1000),
          },
        ],
      }),
    );

    const result = loadScenarioEvidenceFromDisk(testRootDir);

    expect(result.customer?.results[0]).toEqual(
      expect.objectContaining({
        status: 'passed',
        executed: true,
        truthMode: 'inferred',
      }),
    );
    expect(result.customer?.results[0].machineWork?.terminalProofReason).toContain(
      'has no runtime-observed terminal proof',
    );
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

  it('should turn customer and soak synthetic missing evidence into PULSE machine proof debt', () => {
    fs.writeFileSync(
      path.join(evidenceDir, 'PULSE_CUSTOMER_EVIDENCE.json'),
      JSON.stringify({
        actorKind: 'customer',
        declared: ['customer-checkout'],
        executed: [],
        missing: ['customer-checkout'],
        passed: [],
        failed: [],
        summary: 'customer synthetic not executed',
        results: [
          {
            scenarioId: 'customer-checkout',
            status: 'missing_evidence',
            executed: false,
            critical: true,
            routePatterns: ['/api/checkout'],
          },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(evidenceDir, 'PULSE_SOAK_EVIDENCE.json'),
      JSON.stringify({
        actorKind: 'soak',
        declared: ['queue-soak'],
        executed: [],
        missing: ['queue-soak'],
        passed: [],
        failed: [],
        summary: 'soak synthetic not executed',
        results: [
          {
            scenarioId: 'queue-soak',
            status: 'missing_evidence',
            executed: false,
            critical: true,
            moduleKeys: ['queue'],
          },
        ],
      }),
    );

    const result = loadScenarioEvidenceFromDisk(testRootDir);

    expect(result.customer?.results[0].machineWork).toEqual(
      expect.objectContaining({
        kind: 'pulse_machine_proof_debt',
        actionable: true,
        terminalProofReason: expect.stringContaining('PULSE machine work'),
      }),
    );
    expect(result.customer?.results[0].machineWork?.requiredValidation).toEqual(
      expect.arrayContaining([
        'scenario_blueprint_generated',
        'scenario_runtime_execution_attempted_or_classified',
        'terminal_proof_reason_recorded',
      ]),
    );
    expect(result.soak?.results[0].machineWork?.terminalProofReason).toContain(
      'soak synthetic scenario queue-soak has no runtime-observed terminal proof',
    );
    expect(result.soak?.results[0].actorKind).toBe('system');
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
