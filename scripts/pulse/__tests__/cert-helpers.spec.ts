import { describe, expect, it } from 'vitest';

import {
  deriveGateOrderFromResults,
  getCertificationTiers,
  getFinalReadinessCriteria,
} from '../cert-helpers';
import type {
  PulseGateResult,
  PulseManifestFinalReadinessCriteria,
  PulseResolvedManifest,
} from '../types';

describe('cert helper derived certification structure', () => {
  it('does not invent certification tiers when the resolved manifest has none', () => {
    expect(getCertificationTiers(makeResolvedManifest([]))).toEqual([]);
  });

  it('sorts manifest-provided certification tiers instead of using code defaults', () => {
    const tiers = getCertificationTiers(
      makeResolvedManifest([
        { id: 2, name: 'Second artifact tier', gates: ['runtimePass'] },
        { id: 1, name: 'First artifact tier', gates: ['scopeClosed'] },
      ]),
    );

    expect(tiers.map((tier) => tier.name)).toEqual(['First artifact tier', 'Second artifact tier']);
  });

  it('uses resolved final readiness criteria as the decision source', () => {
    const criteria: PulseManifestFinalReadinessCriteria = {
      requireAllTiersPass: false,
      requireNoAcceptedCriticalFlows: true,
      requireNoAcceptedCriticalScenarios: false,
      requireWorldStateConvergence: true,
    };

    expect(getFinalReadinessCriteria(makeResolvedManifest([], criteria))).toBe(criteria);
  });

  it('derives gate order from evaluated gate evidence keys', () => {
    const pass: PulseGateResult = { status: 'pass', reason: 'observed' };

    expect(
      deriveGateOrderFromResults({
        runtimePass: pass,
        noOverclaimPass: pass,
      }),
    ).toEqual(['runtimePass', 'noOverclaimPass']);
  });
});

function makeResolvedManifest(
  certificationTiers: PulseResolvedManifest['certificationTiers'],
  finalReadinessCriteria: PulseManifestFinalReadinessCriteria = {
    requireAllTiersPass: true,
    requireNoAcceptedCriticalFlows: true,
    requireNoAcceptedCriticalScenarios: true,
    requireWorldStateConvergence: true,
  },
): PulseResolvedManifest {
  return {
    generatedAt: '2026-04-30T00:00:00.000Z',
    sourceManifestPath: 'pulse.manifest.json',
    projectId: 'pulse',
    projectName: 'PULSE',
    systemType: 'certification-machine',
    supportedStacks: [],
    surfaces: [],
    criticalDomains: [],
    modules: [],
    flowGroups: [],
    actorProfiles: [],
    scenarioSpecs: [],
    flowSpecs: [],
    invariantSpecs: [],
    temporaryAcceptances: [],
    certificationTiers,
    finalReadinessCriteria,
    securityRequirements: [],
    recoveryRequirements: [],
    slos: {},
    summary: {
      totalModules: 0,
      resolvedModules: 0,
      unresolvedModules: 0,
      scopeOnlyModuleCandidates: 0,
      humanRequiredModules: 0,
      totalFlowGroups: 0,
      resolvedFlowGroups: 0,
      unresolvedFlowGroups: 0,
      orphanManualModules: 0,
      orphanFlowSpecs: 0,
      excludedModules: 0,
      excludedFlowGroups: 0,
      groupedFlowGroups: 0,
      sharedCapabilityGroups: 0,
      opsInternalFlowGroups: 0,
      legacyNoiseFlowGroups: 0,
      legacyManualModules: 0,
    },
    diagnostics: {
      unresolvedModules: [],
      orphanManualModules: [],
      scopeOnlyModuleCandidates: [],
      humanRequiredModules: [],
      unresolvedFlowGroups: [],
      orphanFlowSpecs: [],
      excludedModules: [],
      excludedFlowGroups: [],
      legacyManualModules: [],
      groupedFlowGroups: [],
      sharedCapabilityGroups: [],
      opsInternalFlowGroups: [],
      legacyNoiseFlowGroups: [],
      blockerCount: 0,
      warningCount: 0,
    },
  };
}
