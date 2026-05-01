function isApplicableRequirement(mode: CheckRequirement): boolean {
  return mode !== 'not_required';
}

function isEmptyCollection(value: { length: number }): boolean {
  return value.length === zero();
}

function isEmptyTotal(value: number): boolean {
  return value === zero();
}

function isPassed(gate: DoDGate): boolean {
  return gate.status === 'pass';
}

function isFailed(gate: DoDGate): boolean {
  return gate.status === 'fail';
}

function isDoneStatus(status: DoDOverallStatus): boolean {
  return status === 'done';
}

function isPartialStatus(status: DoDOverallStatus): boolean {
  return status === 'partial';
}

function isBlockedStatus(status: DoDOverallStatus): boolean {
  return status === 'blocked';
}

function isInferredTruthMode(truthMode: string): boolean {
  return truthMode === 'inferred';
}

function certaintyFromStatus(status: DoDOverallStatus): number {
  const completeWeight = Number(Boolean(status));
  const partialWeight = 'partial'.length;
  const blockedWeight = 'done'.length - completeWeight;
  const denominator = partialWeight + blockedWeight;

  if (isDoneStatus(status)) {
    return completeWeight;
  }
  if (isPartialStatus(status)) {
    return partialWeight / denominator;
  }
  if (isBlockedStatus(status)) {
    return blockedWeight / denominator;
  }
  return Number(!status);
}

function sumNumbers(values: number[]): number {
  return values.reduce((sum, value) => sum + value, zero());
}

function scanFilesForPattern(
  filePaths: string[],
  rootDir: string,
  kernelGrammar: RegExp,
): { found: boolean; matches: string[] } {
  const matches: string[] = [];
  for (const relPath of filePaths) {
    const absPath = safeJoin(resolveRoot(rootDir), relPath);
    if (!pathExists(absPath)) {
      continue;
    }
    try {
      const content = readTextFile(absPath);
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (kernelGrammar.test(lines[i])) {
          matches.push(`${relPath}:${lineNumberFromIndex(i)}`);
        }
      }
    } catch {
      continue;
    }
  }
  return { found: matches.length > 0, matches };
}

function testFilesExist(filePaths: string[], rootDir: string): { found: boolean; files: string[] } {
  const testPatterns = [/\.spec\.tsx?$/, /\.spec\.jsx?$/, /\.test\.tsx?$/, /\.test\.jsx?$/];
  const dirPatterns = ['__tests__', 'tests', 'test'];
  const sourceDirs = new Set<string>();
  const found: string[] = [];

  for (const relPath of filePaths) {
    const dir = path.dirname(relPath);
    sourceDirs.add(dir);
  }

  for (const dir of sourceDirs) {
    const absPath = safeJoin(resolveRoot(rootDir), dir);
    if (!pathExists(absPath)) {
      continue;
    }
    try {
      const entries = fs.readdirSync(absPath);
      for (const entry of entries) {
        if (testPatterns.some((p) => p.test(entry))) {
          found.push(`${dir}/${entry}`);
        }
      }
    } catch {
      continue;
    }
  }

  for (const sourceDir of sourceDirs) {
    for (const dp of dirPatterns) {
      const testDir = safeJoin(resolveRoot(rootDir), sourceDir, dp);
      if (pathExists(testDir)) {
        try {
          const entries = fs.readdirSync(testDir);
          for (const entry of entries) {
            if (testPatterns.some((p) => p.test(entry))) {
              found.push(`${sourceDir}/${dp}/${entry}`);
            }
          }
        } catch {
          continue;
        }
      }
    }
  }

  return { found: found.length > 0, files: [...new Set(found)].sort() };
}

function deriveGateStrictness(
  def: { required: boolean; blocking: boolean },
  riskLevel: DoDRiskLevel,
): { required: boolean; blocking: boolean } {
  const elevatedRisk = isElevatedLevel(riskLevel);
  const required = def.required || elevatedRisk;
  const blocking = def.blocking && allowsBlockingOutcome(riskLevel);

  return { required, blocking };
}

// ── Risk-tuned checkGate ───────────────────────────────────────────────────

function assessCriterion(
  criterionName: string,
  capability: CapabilityInput,
  rootDir: string,
  artifacts: LoadedArtifacts,
  riskLevel: DoDRiskLevel,
): DoDGate {
  const gateName = criterionName;
  const def = dodGateKernelGrammar().find((g) => g.name === gateName);
  if (!def) {
    return {
      name: gateName,
      description: 'Unknown gate',
      status: 'not_tested',
      evidence: [],
      required: false,
      blocking: false,
    };
  }

  const riskTuning = deriveGateStrictness(def, riskLevel);

  try {
    switch (criterionName) {
      case 'ui_exists': {
        const uiNodes = nodePrefixesForKind(capability.nodeIds, 'ui');
        if (hasNodeKind(capability.nodeIds, 'ui')) {
          return {
            name: gateName,
            description: def.description,
            status: 'pass',
            evidence: uiNodes.slice(0, 6),
            required: riskTuning.required,
            blocking: riskTuning.blocking,
          };
        }
        return {
          name: gateName,
          description: def.description,
          status: riskTuning.required ? 'fail' : 'not_applicable',
          evidence: [],
          required: riskTuning.required,
          blocking: riskTuning.blocking,
        };
      }

      case 'api_exists': {
        const apiNodes = [
          ...nodePrefixesForKind(capability.nodeIds, 'api'),
          ...nodePrefixesForKind(capability.nodeIds, 'route'),
        ];
        if (apiNodes.length > 0) {
          return {
            name: gateName,
            description: def.description,
            status: 'pass',
            evidence: apiNodes.slice(0, 6),
            required: riskTuning.required,
            blocking: riskTuning.blocking,
          };
        }
        return {
          name: gateName,
          description: def.description,
          status: riskTuning.required ? 'fail' : 'not_applicable',
          evidence: [],
          required: riskTuning.required,
          blocking: riskTuning.blocking,
        };
      }

      case 'service_exists': {
        const svcNodes = nodePrefixesForKind(capability.nodeIds, 'service');
        if (svcNodes.length > 0) {
          return {
            name: gateName,
            description: def.description,
            status: 'pass',
            evidence: svcNodes.slice(0, 6),
            required: riskTuning.required,
            blocking: riskTuning.blocking,
          };
        }
        return {
          name: gateName,
          description: def.description,
          status: riskTuning.required ? 'fail' : 'not_applicable',
          evidence: [],
          required: riskTuning.required,
          blocking: riskTuning.blocking,
        };
      }

      case 'persistence_exists': {
        const persistNodes = nodePrefixesForKind(capability.nodeIds, 'persistence');
        const prismaFileKernelGrammar = /\.prisma\b/i;
        const prismaFiles = capability.filePaths.filter((fp) => prismaFileKernelGrammar.test(fp));
        if (persistNodes.length > 0 || prismaFiles.length > 0) {
          return {
            name: gateName,
            description: def.description,
            status: 'pass',
            evidence: [...persistNodes.slice(0, 5), ...prismaFiles.slice(0, 5)],
            required: riskTuning.required,
            blocking: riskTuning.blocking,
          };
        }
        return {
          name: gateName,
          description: def.description,
          status: riskTuning.required ? 'fail' : 'not_applicable',
          evidence: [],
          required: riskTuning.required,
          blocking: riskTuning.blocking,
        };
      }

      case 'side_effects_exist': {
        const sideNodes = nodePrefixesForKind(capability.nodeIds, 'side-effect');
        const externalCallKernelGrammar =
          /\b(fetch\b|axios|\.post\(|\.get\(|webhook|publish|sendMessage|enqueue|emit\b)/i;
        const scanResult = scanFilesForPattern(
          capability.filePaths,
          rootDir,
          externalCallKernelGrammar,
        );
        if (sideNodes.length > 0 || scanResult.found) {
          return {
            name: gateName,
            description: def.description,
            status: 'pass',
            evidence: [...sideNodes.slice(0, 4), ...scanResult.matches.slice(0, 4)],
            required: riskTuning.required,
            blocking: riskTuning.blocking,
          };
        }
        return {
          name: gateName,
          description: def.description,
          status: 'not_applicable',
          evidence: [],
          required: riskTuning.required,
          blocking: riskTuning.blocking,
        };
      }

      case 'unit_tests_pass': {
        const testResult = testFilesExist(capability.filePaths, rootDir);
        if (testResult.found) {
          return {
            name: gateName,
            description: def.description,
            status: 'pass',
            evidence: testResult.files.slice(0, 8),
            required: riskTuning.required,
            blocking: riskTuning.blocking,
          };
        }
        return {
          name: gateName,
          description: def.description,
          status: riskTuning.required ? 'fail' : 'not_tested',
          evidence: [],
          required: riskTuning.required,
          blocking: riskTuning.blocking,
        };
      }

      case 'integration_tests_pass': {
        if (artifacts.scenarioCoverage) {
          const capId = capability.id;
          const scenarios = artifacts.scenarioCoverage as Record<string, unknown>;
          const scenarioEntries = Object.entries(scenarios)
            .filter(([, v]) => {
              if (typeof v === 'object' && v !== null) {
                const obj = v as Record<string, unknown>;
                const relatedCaps = obj.relatedCapabilities || obj.capabilityIds || [];
                return Array.isArray(relatedCaps) && relatedCaps.includes(capId);
              }
              return false;
            })
            .map(([k]) => k);
          if (scenarioEntries.length > 0) {
            return {
              name: gateName,
              description: def.description,
              status: 'pass',
              evidence: scenarioEntries.slice(0, 6),
              required: riskTuning.required,
              blocking: riskTuning.blocking,
            };
          }
        }
        return {
          name: gateName,
          description: def.description,
          status: riskTuning.required ? 'fail' : 'not_tested',
          evidence: [],
          required: riskTuning.required,
          blocking: riskTuning.blocking,
        };
      }

      case 'runtime_observed': {
        if (artifacts.runtimeEvidence) {
          const runtime = artifacts.runtimeEvidence as Record<string, unknown>;
          const probes = runtime.probes || runtime.checks || [];
          const evidence =
            Array.isArray(probes) && probes.length > 0 ? ['Runtime probe(s) recorded'] : [];
          return {
            name: gateName,
            description: def.description,
            status: evidence.length > 0 ? 'pass' : 'not_tested',
            evidence,
            required: riskTuning.required,
            blocking: riskTuning.blocking,
          };
        }
        return {
          name: gateName,
          description: def.description,
          status: riskTuning.required ? 'fail' : 'not_tested',
          evidence: [],
          required: riskTuning.required,
          blocking: riskTuning.blocking,
        };
      }

      case 'observability_attached': {
        const logEvidenceKernelGrammar =
          /\b(logger|log|console\.(log|error|warn|info)|tracing|metric|counter|histogram|span)\b/i;
        const scanResult = scanFilesForPattern(
          capability.filePaths,
          rootDir,
          logEvidenceKernelGrammar,
        );
        const obsFileNames = capability.filePaths.filter((fp) =>
          /\b(log|logging|logger|metrics|tracing|telemetry)\b/i.test(fp),
        );
        if (scanResult.found || obsFileNames.length > 0) {
          return {
            name: gateName,
            description: def.description,
            status: 'pass',
            evidence: [...obsFileNames.slice(0, 4), ...scanResult.matches.slice(0, 4)],
            required: riskTuning.required,
            blocking: riskTuning.blocking,
          };
        }
        return {
          name: gateName,
          description: def.description,
          status: riskTuning.required ? 'fail' : 'not_tested',
          evidence: [],
          required: riskTuning.required,
          blocking: riskTuning.blocking,
        };
      }

      case 'security_gates_pass': {
        const authEvidenceKernelGrammar =
          /\b(auth|authorize|authorise|authenticate|guard|canActivate|hasRole|hasPermission|requireAuth|isAuthenticated|validate|class-validator|@IsString|@IsNumber|@Length|@Min|@Max|rate.?limit|throttle)\b/i;
        const scanResult = scanFilesForPattern(
          capability.filePaths,
          rootDir,
          authEvidenceKernelGrammar,
        );
        const securityFiles = capability.filePaths.filter((fp) =>
          /\b(auth|guard|security|validate|permission|role)\b/i.test(fp),
        );
        if (scanResult.found || securityFiles.length > 0) {
          return {
            name: gateName,
            description: def.description,
            status: 'pass',
            evidence: [...securityFiles.slice(0, 4), ...scanResult.matches.slice(0, 4)],
            required: riskTuning.required,
            blocking: riskTuning.blocking,
          };
        }
        return {
          name: gateName,
          description: def.description,
          status: riskTuning.required ? 'fail' : 'not_applicable',
          evidence: [],
          required: riskTuning.required,
          blocking: riskTuning.blocking,
        };
      }

      case 'recovery_path_exists': {
        const recoveryEvidenceKernelGrammar =
          /\b(try\s*\{|catch\s*\(|\.catch\(|retry|circuit.?breaker|fallback|onError|errorHandler|resilience|dead.letter|nack|requeue|reject)\b/i;
        const scanResult = scanFilesForPattern(
          capability.filePaths,
          rootDir,
          recoveryEvidenceKernelGrammar,
        );
        if (scanResult.found) {
          return {
            name: gateName,
            description: def.description,
            status: 'pass',
            evidence: scanResult.matches.slice(0, 6),
            required: riskTuning.required,
            blocking: riskTuning.blocking,
          };
        }
        return {
          name: gateName,
          description: def.description,
          status: riskTuning.required ? 'fail' : 'not_tested',
          evidence: [],
          required: riskTuning.required,
          blocking: riskTuning.blocking,
        };
      }

      default:
        return {
          name: gateName,
          description: def.description,
          status: 'not_tested',
          evidence: [],
          required: riskTuning.required,
          blocking: riskTuning.blocking,
        };
    }
  } catch (err) {
    return {
      name: gateName,
      description: def.description,
      status: 'not_tested',
      evidence: [`Error evaluating gate: ${err instanceof Error ? err.message : String(err)}`],
      required: riskTuning.required,
      blocking: riskTuning.blocking,
    };
  }
}

// ── Structural checks ──────────────────────────────────────────────────────

/**
 * Run all 11 structural checks against a capability's files, weighted by
 * risk level. Returns a map of check name → boolean (true = evidence found).
 */
function evaluateStructuralChecks(
  capability: CapabilityInput,
  rootDir: string,
  riskLevel: DoDRiskLevel,
): Record<string, boolean> {
  const results: Record<string, boolean> = {};

  for (const check of dodStructuralEvidenceKernelGrammar()) {
    const reqMode = check[riskLevel] as CheckRequirement;
    if (reqMode === 'not_required') {
      results[check.name] = true; // waived
      continue;
    }

    let found = false;

    if (check.pathKernelGrammar) {
      const hasPathMatch = capability.filePaths.some((fp) => check.pathKernelGrammar!.test(fp));
      if (hasPathMatch) {
        found = true;
      }
    }

    if (!found) {
      const scanResult = scanFilesForPattern(capability.filePaths, rootDir, check.kernelGrammar);
      if (scanResult.found) {
        found = true;
      }
    }

    results[check.name] = found;
  }

  return results;
}

// ── Classification ─────────────────────────────────────────────────────────

/** Count structural checks that are both required and met. */
function countRequiredStructuralChecks(
  checks: Record<string, boolean>,
  riskLevel: DoDRiskLevel,
): number {
  return dodStructuralEvidenceKernelGrammar().filter((check) => {
    const reqMode = check[riskLevel] as CheckRequirement;
    return isApplicableRequirement(reqMode) && checks[check.name];
  }).length;
}

function applicableStructuralChecks(riskLevel: DoDRiskLevel): number {
  return dodStructuralEvidenceKernelGrammar().filter((check) =>
    isApplicableRequirement(check[riskLevel] as CheckRequirement),
  ).length;
}

function structuralEvidenceProfile(
  checks: Record<string, boolean>,
  riskLevel: DoDRiskLevel,
): {
  hasAnyEvidence: boolean;
  hasMajorityEvidence: boolean;
  hasCompleteEvidence: boolean;
} {
  const applicable = applicableStructuralChecks(riskLevel);
  const observed = countRequiredStructuralChecks(checks, riskLevel);

  if (isEmptyTotal(applicable)) {
    return {
      hasAnyEvidence: true,
      hasMajorityEvidence: true,
      hasCompleteEvidence: true,
    };
  }

  return {
    hasAnyEvidence: observed > 0,
    hasMajorityEvidence: observed * 2 >= applicable,
    hasCompleteEvidence: observed === applicable,
  };
}

/**
 * Classify a capability based on structural evidence, gate status, and
 * runtime observation.
 *
 *   phantom    — truthMode is inferred; no structural evidence beyond
 *                what the graph inference produced.
 *   latent     — some structural evidence, but no runtime observation.
 *   real       — structural evidence + runtime observation confirmed.
 *   production — all required DoD gates pass.
 */
function classifyCapability(
  structuralChecks: Record<string, boolean>,
  gates: DoDGate[],
  riskLevel: DoDRiskLevel,
  truthMode: string,
  requiredBeforeReal: string[],
): DoDCapabilityClassification {
  const allRequiredPass = gates.filter((g) => g.required).every((g) => g.status === 'pass');

  const runtimeObserved = gates.find((g) => g.name === 'runtime_observed')?.status === 'pass';
  const blockingPass = gates.every((g) => !g.blocking || g.status !== 'fail');

  const structuralProfile = structuralEvidenceProfile(structuralChecks, riskLevel);

  // phantom: truth mode is inferred with no structural backing
  if (isInferredTruthMode(truthMode) && !structuralProfile.hasAnyEvidence) {
    return 'phantom';
  }

  // production: all blocking + required gates pass AND structural checks complete
  if (
    allRequiredPass &&
    blockingPass &&
    structuralProfile.hasCompleteEvidence &&
    runtimeObserved &&
    isEmptyCollection(requiredBeforeReal)
  ) {
    return 'production';
  }

  // real: enough structural evidence AND runtime observed
  if (
    structuralProfile.hasMajorityEvidence &&
    runtimeObserved &&
    isEmptyCollection(requiredBeforeReal)
  ) {
    return 'real';
  }

  // latent: some structural evidence (but not enough for real)
  if (structuralProfile.hasAnyEvidence) {
    return 'latent';
  }

  // phantom: minimal structural evidence
  return 'phantom';
}

// ── Scoring ────────────────────────────────────────────────────────────────

function computeScore(
  gates: DoDGate[],
  structuralChecks: Record<string, boolean>,
): { score: number; maxScore: number } {
  const requiredGateStates = gates.filter((gate) => gate.required);
  const structuralStates = Object.values(structuralChecks);
  const score =
    requiredGateStates.filter(isPassed).length + structuralStates.filter(Boolean).length;
  const maxScore = requiredGateStates.length + structuralStates.length;

  return { score, maxScore };
}

// ── Required-before-real ───────────────────────────────────────────────────

function findGateStatus(gates: DoDGate[], gateName: string): DoDGate['status'] | null {
  return gates.find((gate) => gate.name === gateName)?.status ?? null;
}

function determineRequiredBeforeReal(capability: CapabilityInput, gates: DoDGate[]): string[] {
  const required: string[] = [];
  const hasApi = hasNodeKind(capability.nodeIds, 'api') || hasNodeKind(capability.nodeIds, 'route');
  const hasPersistence = hasNodeKind(capability.nodeIds, 'persistence');
  const hasSideEffect = hasNodeKind(capability.nodeIds, 'side-effect');
  const hasUi = hasNodeKind(capability.nodeIds, 'ui');
  const integrationStatus = findGateStatus(gates, 'integration_tests_pass');
  const runtimeStatus = findGateStatus(gates, 'runtime_observed');
  const persistenceStatus = findGateStatus(gates, 'persistence_exists');
  const sideEffectStatus = findGateStatus(gates, 'side_effects_exist');

  if (runtimeStatus !== 'pass') {
    required.push(`Observed runtime proof for ${capability.name}`);
  }
  if (hasUi && integrationStatus !== 'pass') {
    required.push(`End-to-end browser scenario for ${capability.name} through Playwright`);
  }
  if (hasApi && integrationStatus !== 'pass') {
    required.push(`API integration test covering ${capability.name} endpoints`);
  }
  if (hasPersistence && persistenceStatus !== 'pass') {
    required.push(`Database persistence verified for ${capability.name}`);
  }
  if (hasSideEffect && sideEffectStatus !== 'pass') {
    required.push(
      `Side-effect replay verified for ${capability.name} (webhook/queue/external API)`,
    );
  }
  if (hasPersistence && hasSideEffect && integrationStatus !== 'pass') {
    required.push(`Idempotency guarantee for ${capability.name} side effects`);
  }

  return required.length > 0 ? required : [];
}

// ── Overall status from gates ──────────────────────────────────────────────

function computeOverallStatus(gates: DoDGate[]): DoDOverallStatus {
  if (gates.length === 0) {
    return 'not_started';
  }

  const allNotTested = gates.every((g) => g.status === 'not_tested');
  if (allNotTested) {
    return 'not_started';
  }

  const blockingFailed = gates.some((g) => g.blocking && g.status === 'fail');
  if (blockingFailed) {
    return 'blocked';
  }

  const requiredFailed = gates.some((g) => g.required && g.status === 'fail');
  if (requiredFailed) {
    return 'partial';
  }

  const allRequiredPass = gates.filter((g) => g.required).every((g) => g.status === 'pass');
  if (allRequiredPass) {
    return 'done';
  }

  return 'partial';
}

// ── Evaluate one capability ────────────────────────────────────────────────

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

// ── Main engine exports ────────────────────────────────────────────────────

/**
 * Build the full DoDEngineState and DoDState for every capability
 * discovered in the current PULSE capability state artifact.
 *
 * Reads `PULSE_CAPABILITY_STATE.json` (and supporting artifacts) from
 * `.pulse/current/`, evaluates every capability against risk-tuned DoD
 * gates, classifies each capability, and writes two artifacts:
 *   - `.pulse/current/PULSE_DOD_ENGINE.json` — gate-level evaluation
 *   - `.pulse/current/PULSE_DOD_STATE.json`  — classification + scoring
 *
 * @param rootDir  Absolute path to the repo root.
 * @returns The complete DoDEngineState written to disk.
 */
// ── Moved from dod-engine.ts ────────────────────────────────────────────

function nodePrefixesForKind(nodeIds: string[], prefix: string): string[] {
  const pattern = new RegExp(`^${prefix}:`);
  return nodeIds.filter((id) => pattern.test(id));
}

function hasNodeKind(nodeIds: string[], prefix: string): boolean {
  return nodePrefixesForKind(nodeIds, prefix).length > 0;
}

function containsObservedItems(items: readonly unknown[] | null | undefined): boolean {
  return Array.isArray(items) && items.length > zero();
}

function containsReportedIssue(value: number | null | undefined): boolean {
  return typeof value === 'number' && value > zero();
}

function lineNumberFromIndex(index: number): number {
  return index + Number(Number.isInteger(index));
}

function zero(): number {
  return Number(false);
}

function isElevatedLevel(riskLevel: DoDRiskLevel): boolean {
  return riskLevel === 'critical' || riskLevel === 'high';
}

function allowsBlockingOutcome(riskLevel: DoDRiskLevel): boolean {
  return riskLevel !== 'low';
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

  // ── DoDEngineState (PULSE_DOD_ENGINE.json) ───────────────────────────

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

  // ── DoDState (PULSE_DOD_STATE.json) ──────────────────────────────────

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
