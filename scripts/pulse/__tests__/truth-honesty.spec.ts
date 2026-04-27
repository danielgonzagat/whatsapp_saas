/**
 * truth-honesty.spec.ts
 *
 * Proves that structural-only actors emit `truthMode: 'inferred'`, not
 * `'observed'`, and that the actor gates require observed evidence to pass.
 *
 * These invariants guarantee that `customerPass`, `operatorPass`, and
 * `adminPass` cannot pass on file-existence checks alone.
 */
import { describe, it, expect } from 'vitest';
import { evaluateActorGate } from '../cert-gate-evaluators-actor';
import { observeSettingsKycBanking } from '../actors/admin/settings-kyc-banking';
import { observeWhatsappSessionControl } from '../actors/admin/whatsapp-session-control';
import { observeAutopilotRun } from '../actors/operator/autopilot-run';
import { observeCampaignsAndFlows } from '../actors/operator/campaigns-and-flows';
import type { PulseActorEvidence, PulseGateResult } from '../types';

describe('truthMode honesty — structural actors', () => {
  const rootDir = process.cwd();

  it('observeSettingsKycBanking returns truthMode=inferred', () => {
    const obs = observeSettingsKycBanking(rootDir);
    expect(obs.truthMode).toBe('inferred');
    expect(obs.truthMode).not.toBe('observed');
  });

  it('observeWhatsappSessionControl returns truthMode=inferred', () => {
    const obs = observeWhatsappSessionControl(rootDir);
    expect(obs.truthMode).toBe('inferred');
    expect(obs.truthMode).not.toBe('observed');
  });

  it('observeAutopilotRun returns truthMode=inferred', () => {
    const obs = observeAutopilotRun(rootDir);
    expect(obs.truthMode).toBe('inferred');
    expect(obs.truthMode).not.toBe('observed');
  });

  it('observeCampaignsAndFlows returns truthMode=inferred', () => {
    const obs = observeCampaignsAndFlows(rootDir);
    expect(obs.truthMode).toBe('inferred');
    expect(obs.truthMode).not.toBe('observed');
  });
});

describe('evaluateActorGate — requires observed evidence', () => {
  function makeEvidence(
    overrides: Partial<PulseActorEvidence['results'][0]> & { critical?: boolean }[],
  ): PulseActorEvidence {
    return {
      actorKind: 'admin',
      declared: overrides.map((_, i) => `scenario-${i}`),
      results: overrides.map((o, i) => ({
        scenarioId: `scenario-${i}`,
        actorKind: 'admin' as const,
        scenarioKind: 'structural' as const,
        critical: o.critical ?? true,
        requested: true,
        runner: 'playwright-spec' as const,
        status: (o.status as any) ?? 'passed',
        executed: true,
        truthMode: (o.truthMode as any) ?? 'inferred',
        summary: `Scenario ${i}`,
        artifactPaths: [],
        specsExecuted: [],
        durationMs: 0,
        worldStateTouches: [],
        moduleKeys: [],
        routePatterns: [],
      })),
      summary: 'test',
      executed: true,
      totalDeclared: overrides.length,
      totalExecuted: overrides.length,
      totalPassed: overrides.filter((o) => (o.status ?? 'passed') === 'passed').length,
    };
  }

  it('passes when at least one critical scenario has truthMode=observed', () => {
    const evidence = makeEvidence([
      { critical: true, truthMode: 'inferred', status: 'passed' },
      { critical: true, truthMode: 'observed', status: 'passed' },
    ]);
    const result = evaluateActorGate('admin', evidence, true);
    expect(result.status).toBe('pass');
  });

  it('fails when all passed critical scenarios are inferred only', () => {
    const evidence = makeEvidence([
      { critical: true, truthMode: 'inferred', status: 'passed' },
      { critical: true, truthMode: 'inferred', status: 'passed' },
    ]);
    const result = evaluateActorGate('admin', evidence, true);
    expect(result.status).toBe('fail');
  });

  it('fails with missing_evidence failure class when no observed evidence exists', () => {
    const evidence = makeEvidence([{ critical: true, truthMode: 'inferred', status: 'passed' }]);
    const result = evaluateActorGate('admin', evidence, true);
    expect(result.status).toBe('fail');
    expect(result.failureClass).toBe('missing_evidence');
  });
});
