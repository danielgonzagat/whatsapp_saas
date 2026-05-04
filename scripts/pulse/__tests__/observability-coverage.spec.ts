import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildObservabilityCoverage } from '../observability-coverage';
import type { PulseCapability, PulseCapabilityState, PulseFlowProjection } from '../types';

function makeCapability(overrides: Partial<PulseCapability> = {}): PulseCapability {
  return {
    id: 'capability:critical-payment',
    name: 'Critical Payment',
    truthMode: 'observed',
    status: 'real',
    confidence: 1,
    userFacing: true,
    runtimeCritical: true,
    protectedByGovernance: false,
    ownerLane: 'customer',
    executionMode: 'ai_safe',
    rolesPresent: ['orchestration', 'side_effect'],
    missingRoles: [],
    filePaths: ['backend/src/critical-payment.ts'],
    nodeIds: [],
    routePatterns: ['/critical-payment'],
    evidenceSources: ['runtime-observation'],
    codacyIssueCount: 0,
    highSeverityIssueCount: 0,
    blockingReasons: [],
    validationTargets: [],
    maturity: {
      stage: 'operational',
      score: 1,
      dimensions: {
        interfacePresent: true,
        apiSurfacePresent: true,
        orchestrationPresent: true,
        persistencePresent: true,
        sideEffectPresent: true,
        runtimeEvidencePresent: true,
        validationPresent: true,
        scenarioCoveragePresent: true,
        codacyHealthy: true,
        simulationOnly: false,
      },
      missing: [],
    },
    dod: {
      status: 'done',
      missingRoles: [],
      blockers: [],
      truthModeMet: true,
    },
    ...overrides,
  };
}

function writePulseInputs(rootDir: string, capabilities: PulseCapability[]): void {
  const pulseDir = path.join(rootDir, '.pulse', 'current');
  fs.mkdirSync(pulseDir, { recursive: true });

  const capabilityState: PulseCapabilityState = {
    generatedAt: '2026-04-29T00:00:00.000Z',
    summary: {
      totalCapabilities: capabilities.length,
      realCapabilities: capabilities.length,
      partialCapabilities: 0,
      latentCapabilities: 0,
      phantomCapabilities: 0,
      humanRequiredCapabilities: 0,
      foundationalCapabilities: 0,
      connectedCapabilities: 0,
      operationalCapabilities: capabilities.length,
      productionReadyCapabilities: 0,
      runtimeObservedCapabilities: capabilities.length,
      scenarioCoveredCapabilities: 0,
    },
    capabilities,
  };

  const flowProjection: PulseFlowProjection = {
    generatedAt: '2026-04-29T00:00:00.000Z',
    summary: {
      totalFlows: 0,
      realFlows: 0,
      partialFlows: 0,
      latentFlows: 0,
      phantomFlows: 0,
    },
    flows: [],
  };

  fs.writeFileSync(
    path.join(pulseDir, 'PULSE_CAPABILITY_STATE.json'),
    JSON.stringify(capabilityState, null, 2),
    'utf8',
  );
  fs.writeFileSync(
    path.join(pulseDir, 'PULSE_FLOW_PROJECTION.json'),
    JSON.stringify(flowProjection, null, 2),
    'utf8',
  );
}

describe('PULSE observability coverage', () => {
  it('resolves relative capability files and writes the canonical artifact', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-observability-'));
    const sourcePath = path.join(rootDir, 'backend', 'src', 'critical-payment.ts');
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(
      sourcePath,
      [
        "import * as Sentry from '@sentry/node';",
        'const OPS_WEBHOOK_URL = process.env.OPS_WEBHOOK_URL;',
        'const dashboardUrl = "https://datadog.example.test/dashboard/payment";',
        'const errorBudgetRemaining = 0.99;',
        'export class CriticalPayment {',
        '  private readonly logger = new Logger(CriticalPayment.name);',
        '  run(workspaceId: string): void {',
        '    this.logger.log({ workspaceId, operation: "charge", status: "started" });',
        '    const span = tracer.startSpan("charge");',
        '    counter.inc();',
        '    Sentry.captureException(new Error("boom"));',
        '    notifyAlert({ target: OPS_WEBHOOK_URL });',
        '    span.finish();',
        '  }',
        '}',
      ].join('\n'),
      'utf8',
    );

    writePulseInputs(rootDir, [makeCapability()]);

    const state = buildObservabilityCoverage(rootDir);
    const artifactPath = path.join(
      rootDir,
      '.pulse',
      'current',
      'PULSE_OBSERVABILITY_COVERAGE.json',
    );
    const capability = state.capabilities[0];

    expect(fs.existsSync(artifactPath)).toBe(true);
    expect(capability.details.matchedFilePaths).toEqual(['backend/src/critical-payment.ts']);
    expect(capability.pillars.logs).toBe('observed');
    expect(capability.evidence.logs.sourceKind).toBe('static_instrumentation');
    expect(capability.evidence.logs.observed).toBe(true);
    expect(capability.pillars.dashboards).toBe('partial');
    expect(capability.evidence.dashboards.sourceKind).toBe('catalog');
    expect(capability.evidence.dashboards.observed).toBe(false);
    expect(capability.evidence.dashboards.truthMode).toBe('inferred');
    expect(capability.evidence.dashboards.machineImprovementSignal).toEqual(
      expect.objectContaining({
        targetEngine: 'observability-coverage',
        truthMode: 'inferred',
        productEditRequired: false,
      }),
    );
    expect(capability.pillars.error_budget).toBe('observed');
    expect(capability.evidence.error_budget.sourceKind).toBe('static_instrumentation');
    expect(capability.evidence.error_budget.observed).toBe(true);
    expect(capability.evidence.error_budget.truthMode).toBe('observed');
  });

  it('does not turn alert configuration into observed evidence for critical capabilities', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-observability-config-'));
    const sourcePath = path.join(rootDir, 'backend', 'src', 'critical-payment.ts');
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(
      sourcePath,
      [
        'const OPS_WEBHOOK_URL = process.env.OPS_WEBHOOK_URL;',
        'const PROMETHEUS_ALERT = "payment-failed";',
        'export const configured = OPS_WEBHOOK_URL || PROMETHEUS_ALERT;',
      ].join('\n'),
      'utf8',
    );

    writePulseInputs(rootDir, [makeCapability()]);

    const capability = buildObservabilityCoverage(rootDir).capabilities[0];

    expect(capability.runtimeCritical).toBe(true);
    expect(capability.pillars.alerts).toBe('partial');
    expect(capability.evidence.alerts.sourceKind).toBe('configuration');
    expect(capability.evidence.alerts.observed).toBe(false);
    expect(capability.evidence.alerts.truthMode).toBe('inferred');
    expect(capability.evidence.alerts.machineImprovementSignal).toEqual(
      expect.objectContaining({
        targetEngine: 'external-sources-orchestrator',
        status: 'partial',
        productEditRequired: false,
      }),
    );
    expect(capability.trustedObservedPillars).not.toContain('alerts');
    expect(capability.criticalObservedByUntrustedSource).toBe(false);
  });

  it('keeps runtime-critical error budget missing when no explicit evidence exists', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-observability-no-budget-'));
    const sourcePath = path.join(rootDir, 'backend', 'src', 'critical-payment.ts');
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(
      sourcePath,
      ['export class CriticalPayment {', '  run(): void {', '    return;', '  }', '}'].join('\n'),
      'utf8',
    );

    writePulseInputs(rootDir, [makeCapability()]);

    const capability = buildObservabilityCoverage(rootDir).capabilities[0];

    expect(capability.runtimeCritical).toBe(true);
    expect(capability.pillars.error_budget).toBe('missing');
    expect(capability.evidence.error_budget.sourceKind).toBe('absent');
    expect(capability.evidence.error_budget.observed).toBe(false);
    expect(capability.evidence.error_budget.truthMode).toBe('not_available');
    expect(capability.evidence.error_budget.machineImprovementSignal).toEqual(
      expect.objectContaining({
        targetEngine: 'observability-coverage',
        truthMode: 'not_available',
        productEditRequired: false,
      }),
    );
  });

  it('does not mark simulated or absent sources as observed', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-observability-simulated-'));
    const sourcePath = path.join(rootDir, 'backend', 'src', 'critical-payment.ts');
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(
      sourcePath,
      [
        'const simulatedObservability = true;',
        'export class CriticalPayment {',
        '  run(): void {',
        '    this.logger.log("pretend log");',
        '  }',
        '}',
      ].join('\n'),
      'utf8',
    );

    writePulseInputs(rootDir, [
      makeCapability(),
      makeCapability({
        id: 'capability:absent-payment',
        filePaths: ['backend/src/missing-payment.ts'],
      }),
    ]);

    const state = buildObservabilityCoverage(rootDir);
    const simulated = state.capabilities.find(
      (capability) => capability.capabilityId === 'capability:critical-payment',
    );
    const absent = state.capabilities.find(
      (capability) => capability.capabilityId === 'capability:absent-payment',
    );

    expect(simulated?.pillars.logs).toBe('missing');
    expect(simulated?.evidence.logs.sourceKind).toBe('simulated');
    expect(simulated?.evidence.logs.observed).toBe(false);
    expect(simulated?.pillars.error_budget).toBe('missing');
    expect(simulated?.evidence.error_budget.sourceKind).toBe('simulated');
    expect(simulated?.evidence.error_budget.observed).toBe(false);
    expect(absent?.details.matchedFilePaths).toEqual([]);
    expect(absent?.pillars.logs).toBe('missing');
    expect(absent?.evidence.logs.sourceKind).toBe('absent');
    expect(absent?.evidence.logs.observed).toBe(false);
    expect(absent?.machineImprovementSignals.length).toBeGreaterThan(0);
    expect(state.summary.machineImprovementSignals).toBeGreaterThan(0);
    expect(
      absent?.machineImprovementSignals.every((signal) =>
        signal.recommendedPulseAction.includes('PULSE'),
      ),
    ).toBe(true);
  });
});
