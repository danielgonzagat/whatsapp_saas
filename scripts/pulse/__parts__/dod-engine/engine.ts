import * as fs from 'fs';
import { ensureDir } from '../../safe-fs';
import { safeJoin, resolveRoot } from '../../lib/safe-path';
import type {
  CapabilityDoD,
  DoDCapabilityEntry,
  DoDEngineState,
  DoDRiskLevel,
  DoDState,
  DoDStateSummary,
} from '../../types.dod-engine';
import type { PulseCapability } from '../../types';
import { determineRiskLevel, dodGateKernelGrammar } from './gates-and-risk';
import { assessCriterion } from './gate-assessment';
import { evaluateStructuralChecks } from './structural-checks';
import { classifyCapability } from './classification';
import { computeScore, determineRequiredBeforeReal, computeOverallStatus } from './scoring';
import { isFailed, isPassed, isDoneStatus, sumNumbers, certaintyFromStatus } from './helpers';
import { loadCapabilityState, loadSupportingArtifacts, dodArtifactFile } from './artifacts';
import type { CapabilityInput, LoadedArtifacts } from './artifacts';

function evaluateCapability(
  cap: PulseCapability,
  rootDir: string,
  artifacts: LoadedArtifacts,
  riskLevel: DoDRiskLevel,
): { dod: CapabilityDoD; entry: DoDCapabilityEntry } {
  const input: CapabilityInput = {
    id: cap.id,
    name: cap.name,
    filePaths: cap.filePaths ?? [],
    rolesPresent: cap.rolesPresent ?? [],
    nodeIds: cap.nodeIds ?? [],
  };

  const gates = dodGateKernelGrammar().map((def) =>
    assessCriterion(def.name, input, rootDir, artifacts, riskLevel),
  );

  const structuralChecks = evaluateStructuralChecks(input, rootDir, riskLevel);
  const requiredBeforeProduction = determineRequiredBeforeReal(input, gates);
  const classification = classifyCapability(
    structuralChecks,
    gates,
    riskLevel,
    cap.truthMode ?? 'inferred',
    requiredBeforeProduction,
  );

  const blockingGates = gates.filter((g) => g.blocking && isFailed(g)).map((g) => g.name);

  const missingEvidence = gates.filter((g) => g.required && g.status === 'fail').map((g) => g.name);

  const overallStatus = computeOverallStatus(gates);
  const { score, maxScore } = computeScore(gates, structuralChecks);

  const dod: CapabilityDoD = {
    capabilityId: cap.id,
    capabilityName: cap.name,
    overallStatus,
    gates,
    blockingGates,
    missingEvidence,
    requiredBeforeReal: requiredBeforeProduction,
    lastEvaluated: new Date().toISOString(),
    confidence: certaintyFromStatus(overallStatus),
  };

  const successfulCriteria = gates.filter(isPassed).length;

  const entry: DoDCapabilityEntry = {
    capabilityId: cap.id,
    capabilityName: cap.name,
    riskLevel,
    classification,
    score,
    maxScore,
    passedGates: successfulCriteria,
    totalGates: gates.length,
    gates,
    structuralChecks,
    requiredBeforeProduction,
    lastEvaluated: new Date().toISOString(),
  };

  return { dod, entry };
}

export function buildDoDEngineState(rootDir: string): DoDEngineState {
  const resolvedRoot = resolveRoot(rootDir);
  const pulseDir = safeJoin(resolvedRoot, '.pulse', 'current');

  const state = loadCapabilityState(resolvedRoot);
  const artifacts = loadSupportingArtifacts(resolvedRoot);

  const capabilities: PulseCapability[] = state?.capabilities ?? [];

  const results = capabilities.map((cap) => {
    const riskLevel = determineRiskLevel(cap);
    return evaluateCapability(cap, resolvedRoot, artifacts, riskLevel);
  });

  const evaluations = results.map((r) => r.dod);
  const entries = results.map((r) => r.entry);

  const criticalCapabilities = capabilities.filter(
    (c) => c.runtimeCritical || c.protectedByGovernance,
  );
  const criticalEvals = evaluations.filter((ev) => {
    const cap = capabilities.find((c) => c.id === ev.capabilityId);
    return cap && (cap.runtimeCritical || cap.protectedByGovernance);
  });

  const doneEvals = evaluations.filter((ev) => ev.overallStatus === 'done');
  const partialEvals = evaluations.filter((ev) => ev.overallStatus === 'partial');
  const blockedEvals = evaluations.filter((ev) => ev.overallStatus === 'blocked');
  const notStartedEvals = evaluations.filter((ev) => ev.overallStatus === 'not_started');

  const dodEngineResult: DoDEngineState = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalCapabilities: evaluations.length,
      doneCapabilities: doneEvals.length,
      partialCapabilities: partialEvals.length,
      blockedCapabilities: blockedEvals.length,
      notStartedCapabilities: notStartedEvals.length,
      criticalCapabilities: criticalCapabilities.length,
      criticalCapabilitiesDone: criticalEvals.filter((ev) => isDoneStatus(ev.overallStatus)).length,
    },
    evaluations,
  };

  ensureDir(pulseDir, { recursive: true });
  fs.writeFileSync(
    safeJoin(pulseDir, dodArtifactFile('dod-engine')),
    JSON.stringify(dodEngineResult, null, 2),
    'utf8',
  );

  const phantomEntries = entries.filter((e) => e.classification === 'phantom');
  const latentEntries = entries.filter((e) => e.classification === 'latent');
  const realEntries = entries.filter((e) => e.classification === 'real');
  const productionEntries = entries.filter((e) => e.classification === 'production');

  const byRiskLevel: Record<DoDRiskLevel, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const e of entries) {
    byRiskLevel[e.riskLevel] = (byRiskLevel[e.riskLevel] ?? 0) + 1;
  }

  const overallScore = sumNumbers(entries.map((entry) => entry.score));
  const overallMaxScore = sumNumbers(entries.map((entry) => entry.maxScore));

  const dodStateSummary: DoDStateSummary = {
    totalCapabilities: entries.length,
    phantom: phantomEntries.length,
    latent: latentEntries.length,
    real: realEntries.length,
    production: productionEntries.length,
    byRiskLevel,
    overallScore,
    overallMaxScore,
  };

  const dodState: DoDState = {
    generatedAt: new Date().toISOString(),
    summary: dodStateSummary,
    capabilities: entries,
  };

  fs.writeFileSync(
    safeJoin(pulseDir, dodArtifactFile('dod-state')),
    JSON.stringify(dodState, null, 2),
    'utf8',
  );

  return dodEngineResult;
}
