import type {
  Break,
  PulseCertification,
  PulseConvergenceOwnerLane,
  PulseConvergencePlan,
  PulseConvergenceUnit,
  PulseConvergenceUnitPriority,
  PulseConvergenceUnitStatus,
  PulseGateFailureClass,
  PulseGateName,
  PulseManifestScenarioSpec,
  PulseResolvedManifest,
  PulseScenarioResult,
  PulseWorldState,
} from './types';

interface BuildPulseConvergencePlanInput {
  health: { breaks: Break[] };
  resolvedManifest: PulseResolvedManifest;
  certification: PulseCertification;
}

interface ScenarioAccumulator {
  scenarioId: string;
  spec: PulseManifestScenarioSpec | null;
  actorKinds: Set<string>;
  gateNames: Set<PulseGateName>;
  results: PulseScenarioResult[];
  asyncEntries: PulseWorldState['asyncExpectationsStatus'];
}

const CHECKER_GAP_TYPES = new Set([
  'CHECK_UNAVAILABLE',
  'MANIFEST_MISSING',
  'MANIFEST_INVALID',
  'UNKNOWN_SURFACE',
]);

const SECURITY_PATTERNS = [
  /ROUTE_NO_AUTH/,
  /HARDCODED_SECRET/,
  /SQL_INJECTION/,
  /CSRF/,
  /XSS/,
  /COOKIE_/,
  /SENSITIVE_DATA/,
  /AUTH_BYPASS/,
  /LGPD_/,
  /CRYPTO_/,
];

const EXCLUDED_GATE_UNITS = new Set<PulseGateName>([
  'browserPass',
  'customerPass',
  'operatorPass',
  'adminPass',
  'soakPass',
  'securityPass',
  'staticPass',
]);

const PRIORITY_RANK: Record<PulseConvergenceUnitPriority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

const KIND_RANK: Record<PulseConvergenceUnit['kind'], number> = {
  scenario: 0,
  security: 1,
  gate: 2,
  static: 3,
};

const GATE_PRIORITY: Record<PulseGateName, PulseConvergenceUnitPriority> = {
  scopeClosed: 'P3',
  adapterSupported: 'P3',
  specComplete: 'P3',
  truthExtractionPass: 'P3',
  staticPass: 'P3',
  runtimePass: 'P0',
  browserPass: 'P0',
  flowPass: 'P0',
  invariantPass: 'P2',
  securityPass: 'P2',
  isolationPass: 'P2',
  recoveryPass: 'P2',
  performancePass: 'P2',
  observabilityPass: 'P2',
  customerPass: 'P0',
  operatorPass: 'P1',
  adminPass: 'P1',
  soakPass: 'P3',
  syntheticCoveragePass: 'P3',
  evidenceFresh: 'P3',
  pulseSelfTrustPass: 'P3',
};

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value && value.trim()))),
  ].sort();
}

function compactText(value: string, max: number = 260): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) {
    return compact;
  }
  return `${compact.slice(0, max - 3)}...`;
}

function splitWords(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s\-_]+/g)
    .filter(Boolean);
}

function slugify(value: string): string {
  return splitWords(value)
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function humanize(value: string): string {
  return splitWords(value)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

function isBlockingBreak(item: Break): boolean {
  return (
    (item.severity === 'critical' || item.severity === 'high') && !CHECKER_GAP_TYPES.has(item.type)
  );
}

function isSecurityBreak(item: Break): boolean {
  return SECURITY_PATTERNS.some((pattern) => pattern.test(item.type));
}

function rankBreakTypes(breaks: Break[], limit: number = 8): string[] {
  const counts = new Map<string, number>();
  for (const item of breaks) {
    counts.set(item.type, (counts.get(item.type) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([type, count]) => (count > 1 ? `${type} (${count})` : type));
}

function rankFiles(breaks: Break[], limit: number = 10): string[] {
  const counts = new Map<string, number>();
  for (const item of breaks) {
    counts.set(item.file, (counts.get(item.file) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([file, count]) => (count > 1 ? `${file} (${count})` : file));
}

function normalizeSearchToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function buildSearchTerms(
  scenarioId: string,
  moduleKeys: string[],
  routePatterns: string[],
  flowIds: string[],
): string[] {
  const routeTerms = routePatterns.flatMap((route) => route.split('/').filter(Boolean));
  const flowTerms = flowIds.flatMap((flowId) => flowId.split(/[-_]+/g));
  const scenarioTerms = scenarioId.split(/[-_]+/g);

  return uniqueStrings([...moduleKeys, ...routeTerms, ...flowTerms, ...scenarioTerms]).filter(
    (term) => normalizeSearchToken(term).length >= 3,
  );
}

function findRelatedBreaks(
  breaks: Break[],
  scenarioId: string,
  moduleKeys: string[],
  routePatterns: string[],
  flowIds: string[],
): Break[] {
  const terms = buildSearchTerms(scenarioId, moduleKeys, routePatterns, flowIds);
  if (terms.length === 0) {
    return [];
  }

  return breaks.filter((item) => {
    const haystack = normalizeSearchToken(
      [item.file, item.description, item.detail, item.source || '', item.surface || ''].join(' '),
    );

    return terms.some((term) => haystack.includes(normalizeSearchToken(term)));
  });
}

function determineFailureClass(
  classes: Array<PulseGateFailureClass | undefined>,
  hasPendingAsync: boolean,
): PulseConvergenceUnit['failureClass'] {
  const uniqueClasses = uniqueStrings(classes);
  if (uniqueClasses.length === 1) {
    return uniqueClasses[0] as PulseGateFailureClass;
  }
  if (uniqueClasses.length > 1) {
    return 'mixed';
  }
  if (hasPendingAsync) {
    return 'product_failure';
  }
  return 'unknown';
}

function determineUnitStatus(
  failureClass: PulseConvergenceUnit['failureClass'],
): PulseConvergenceUnitStatus {
  return failureClass === 'missing_evidence' || failureClass === 'checker_gap' ? 'watch' : 'open';
}

function determineScenarioPriority(actorKinds: string[]): PulseConvergenceUnitPriority {
  if (actorKinds.includes('customer') || actorKinds.includes('system')) {
    return 'P0';
  }
  if (actorKinds.includes('operator') || actorKinds.includes('admin')) {
    return 'P1';
  }
  if (actorKinds.includes('soak')) {
    return 'P3';
  }
  return 'P2';
}

function determineScenarioLane(actorKinds: string[]): PulseConvergenceOwnerLane {
  if (actorKinds.includes('customer') || actorKinds.includes('system')) {
    return 'customer';
  }
  if (actorKinds.includes('operator') || actorKinds.includes('admin')) {
    return 'operator-admin';
  }
  if (actorKinds.includes('soak')) {
    return 'reliability';
  }
  return 'platform';
}

function summarizeScenario(
  results: PulseScenarioResult[],
  asyncEntries: PulseWorldState['asyncExpectationsStatus'],
): string {
  const resultSummary = uniqueStrings(
    results
      .filter((result) => result.status !== 'passed')
      .map((result) => compactText(result.summary, 180)),
  ).slice(0, 2);

  const asyncSummary = asyncEntries
    .filter((entry) => entry.status !== 'satisfied')
    .map((entry) => `${entry.expectation}=${entry.status}`);

  const parts = [
    ...resultSummary,
    asyncSummary.length > 0 ? `Async expectations still pending: ${asyncSummary.join(', ')}.` : '',
  ].filter(Boolean);

  if (parts.length === 0) {
    return 'Scenario still needs executed evidence before it can be treated as converged.';
  }

  return compactText(parts.join(' '), 320);
}

function buildValidationArtifacts(
  actorKinds: string[],
  flowIds: string[],
  artifactPaths: string[],
): string[] {
  const actorArtifacts = actorKinds.flatMap((actorKind) => {
    if (actorKind === 'customer') {
      return ['PULSE_CUSTOMER_EVIDENCE.json'];
    }
    if (actorKind === 'operator') {
      return ['PULSE_OPERATOR_EVIDENCE.json'];
    }
    if (actorKind === 'admin') {
      return ['PULSE_ADMIN_EVIDENCE.json'];
    }
    if (actorKind === 'soak') {
      return ['PULSE_SOAK_EVIDENCE.json'];
    }
    return [];
  });

  return uniqueStrings([
    ...artifactPaths,
    ...actorArtifacts,
    flowIds.length > 0 ? 'PULSE_FLOW_EVIDENCE.json' : null,
    'PULSE_CERTIFICATE.json',
    'PULSE_WORLD_STATE.json',
    'PULSE_SCENARIO_COVERAGE.json',
  ]);
}

function buildScenarioUnits(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
  const scenarioSpecById = new Map(
    input.resolvedManifest.scenarioSpecs.map((spec) => [spec.id, spec] as const),
  );
  const flowResultById = new Map(
    input.certification.evidenceSummary.flows.results.map(
      (result) => [result.flowId, result] as const,
    ),
  );
  const actorGateMap: Record<string, PulseGateName> = {
    customer: 'customerPass',
    operator: 'operatorPass',
    admin: 'adminPass',
    soak: 'soakPass',
  };
  const accumulators = new Map<string, ScenarioAccumulator>();
  const actorResults = [
    ...input.certification.evidenceSummary.customer.results,
    ...input.certification.evidenceSummary.operator.results,
    ...input.certification.evidenceSummary.admin.results,
    ...input.certification.evidenceSummary.soak.results,
  ];

  function ensureAccumulator(scenarioId: string): ScenarioAccumulator {
    if (!accumulators.has(scenarioId)) {
      accumulators.set(scenarioId, {
        scenarioId,
        spec: scenarioSpecById.get(scenarioId) || null,
        actorKinds: new Set<string>(),
        gateNames: new Set<PulseGateName>(),
        results: [],
        asyncEntries: [],
      });
    }
    return accumulators.get(scenarioId)!;
  }

  for (const result of actorResults) {
    const accumulator = ensureAccumulator(result.scenarioId);
    accumulator.results.push(result);
    accumulator.actorKinds.add(result.actorKind);
    accumulator.gateNames.add(actorGateMap[result.actorKind]);
    const requiresBrowser =
      Boolean(result.metrics?.requiresBrowser) || Boolean(accumulator.spec?.requiresBrowser);
    if (requiresBrowser) {
      accumulator.gateNames.add('browserPass');
    }
  }

  for (const entry of input.certification.evidenceSummary.worldState.asyncExpectationsStatus) {
    if (entry.status === 'satisfied') {
      continue;
    }
    const accumulator = ensureAccumulator(entry.scenarioId);
    accumulator.asyncEntries.push(entry);
    if (accumulator.spec?.actorKind) {
      accumulator.actorKinds.add(accumulator.spec.actorKind);
    }
  }

  const units: PulseConvergenceUnit[] = [];
  for (const accumulator of accumulators.values()) {
    const spec = accumulator.spec;
    const isCritical =
      Boolean(spec?.critical) || accumulator.results.some((result) => result.critical);
    if (!isCritical) {
      continue;
    }

    const hasNonPassingResult = accumulator.results.some((result) => result.status !== 'passed');
    const hasPendingAsync = accumulator.asyncEntries.some((entry) => entry.status !== 'satisfied');
    if (!hasNonPassingResult && !hasPendingAsync) {
      continue;
    }

    const moduleKeys = uniqueStrings([
      ...(spec?.moduleKeys || []),
      ...accumulator.results.flatMap((result) => result.moduleKeys),
    ]);
    const routePatterns = uniqueStrings([
      ...(spec?.routePatterns || []),
      ...accumulator.results.flatMap((result) => result.routePatterns),
    ]);
    const flowIds = uniqueStrings(spec?.flowSpecs || []);
    const asyncExpectations = uniqueStrings([
      ...(spec?.asyncExpectations || []),
      ...accumulator.asyncEntries.map((entry) => entry.expectation),
    ]);
    const actorKinds = uniqueStrings([...accumulator.actorKinds, spec?.actorKind || null]);
    const artifactPaths = uniqueStrings([
      ...accumulator.results.flatMap((result) => result.artifactPaths),
      'PULSE_CERTIFICATE.json',
    ]);
    const relatedBreaks = findRelatedBreaks(
      input.health.breaks.filter(isBlockingBreak),
      accumulator.scenarioId,
      moduleKeys,
      routePatterns,
      flowIds,
    );
    const failureClass = determineFailureClass(
      accumulator.results
        .filter((result) => result.status !== 'passed')
        .map((result) => result.failureClass),
      hasPendingAsync,
    );
    const requiresBrowser =
      Boolean(spec?.requiresBrowser) ||
      accumulator.results.some((result) => Boolean(result.metrics?.requiresBrowser));
    const flowExitCriteria = flowIds
      .map((flowId) => flowResultById.get(flowId))
      .filter(Boolean)
      .map((result) => result!.flowId);

    units.push({
      id: `scenario-${slugify(accumulator.scenarioId)}`,
      order: 0,
      priority: determineScenarioPriority(actorKinds),
      kind: 'scenario',
      status: determineUnitStatus(failureClass),
      ownerLane: determineScenarioLane(actorKinds),
      title: `Recover ${humanize(accumulator.scenarioId)}`,
      summary: summarizeScenario(accumulator.results, accumulator.asyncEntries),
      targetState: `Scenario ${accumulator.scenarioId} must pass end-to-end and leave no pending async expectations in world state.`,
      failureClass,
      actorKinds,
      gateNames: uniqueStrings([...accumulator.gateNames]) as PulseGateName[],
      scenarioIds: [accumulator.scenarioId],
      moduleKeys,
      routePatterns,
      flowIds,
      asyncExpectations,
      breakTypes: rankBreakTypes(relatedBreaks, 6),
      artifactPaths,
      relatedFiles: rankFiles(relatedBreaks, 10),
      validationArtifacts: buildValidationArtifacts(actorKinds, flowIds, artifactPaths),
      exitCriteria: uniqueStrings([
        `Scenario ${accumulator.scenarioId} reports status=passed in synthetic evidence.`,
        asyncExpectations.length > 0
          ? `Async expectations settle to satisfied: ${asyncExpectations.join(', ')}.`
          : null,
        flowExitCriteria.length > 0
          ? `Related flow evidence passes: ${flowExitCriteria.join(', ')}.`
          : null,
        requiresBrowser && routePatterns.length > 0
          ? `Browser-required routes stay green: ${routePatterns.join(', ')}.`
          : null,
      ]),
    });
  }

  return units;
}

function buildSecurityUnit(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
  if (input.certification.gates.securityPass.status !== 'fail') {
    return [];
  }

  const securityBreaks = input.health.breaks.filter(
    (item) => isBlockingBreak(item) && isSecurityBreak(item),
  );
  const gate = input.certification.gates.securityPass;
  const failureClass = gate.failureClass || 'product_failure';

  return [
    {
      id: 'gate-security-pass',
      order: 0,
      priority: 'P2',
      kind: 'security',
      status: determineUnitStatus(failureClass),
      ownerLane: 'security',
      title: 'Clear Blocking Security And Compliance Findings',
      summary: compactText(
        [
          gate.reason,
          securityBreaks.length > 0
            ? `Top blocking types: ${rankBreakTypes(securityBreaks).join(', ')}.`
            : '',
        ]
          .filter(Boolean)
          .join(' '),
        320,
      ),
      targetState:
        'Security gate must pass with no blocking compliance, auth, cookie, secret, or sensitive-data findings.',
      failureClass,
      actorKinds: [],
      gateNames: ['securityPass'],
      scenarioIds: [],
      moduleKeys: [],
      routePatterns: [],
      flowIds: [],
      asyncExpectations: [],
      breakTypes: rankBreakTypes(securityBreaks, 8),
      artifactPaths: ['PULSE_CERTIFICATE.json', 'PULSE_REPORT.md'],
      relatedFiles: rankFiles(securityBreaks, 12),
      validationArtifacts: ['PULSE_CERTIFICATE.json', 'PULSE_REPORT.md'],
      exitCriteria: uniqueStrings([
        'securityPass returns pass in the next certification run.',
        securityBreaks.length > 0
          ? `Blocking security break types are cleared: ${rankBreakTypes(securityBreaks, 8).join(', ')}.`
          : null,
      ]),
    },
  ];
}

function buildStaticUnit(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
  if (input.certification.gates.staticPass.status !== 'fail') {
    return [];
  }

  const blockingBreaks = input.health.breaks.filter(
    (item) => isBlockingBreak(item) && !isSecurityBreak(item),
  );
  if (blockingBreaks.length === 0) {
    return [];
  }

  const gate = input.certification.gates.staticPass;
  const failureClass = gate.failureClass || 'product_failure';

  return [
    {
      id: 'gate-static-pass',
      order: 0,
      priority: 'P3',
      kind: 'static',
      status: determineUnitStatus(failureClass),
      ownerLane: 'platform',
      title: 'Reduce Remaining Static Critical And High Breakers',
      summary: compactText(
        [gate.reason, `Top structural types: ${rankBreakTypes(blockingBreaks).join(', ')}.`].join(
          ' ',
        ),
        320,
      ),
      targetState:
        'Static certification should have no remaining critical/high blockers outside the scenario and security queues.',
      failureClass,
      actorKinds: [],
      gateNames: ['staticPass'],
      scenarioIds: [],
      moduleKeys: [],
      routePatterns: [],
      flowIds: [],
      asyncExpectations: [],
      breakTypes: rankBreakTypes(blockingBreaks, 10),
      artifactPaths: ['PULSE_CERTIFICATE.json', 'PULSE_REPORT.md'],
      relatedFiles: rankFiles(blockingBreaks, 15),
      validationArtifacts: ['PULSE_CERTIFICATE.json', 'PULSE_REPORT.md'],
      exitCriteria: uniqueStrings([
        'staticPass returns pass in the next certification run.',
        `Blocking static break inventory reaches zero for the tracked set (${blockingBreaks.length} currently open).`,
      ]),
    },
  ];
}

function summarizeGateFocus(gateName: PulseGateName, certification: PulseCertification): string[] {
  if (gateName === 'flowPass') {
    return uniqueStrings(
      certification.evidenceSummary.flows.results
        .filter((result) => result.status !== 'passed')
        .map((result) => `${result.flowId}:${result.status}`),
    );
  }

  if (gateName === 'invariantPass') {
    return uniqueStrings(
      certification.evidenceSummary.invariants.results
        .filter((result) => result.status !== 'passed')
        .map((result) => `${result.invariantId}:${result.status}`),
    );
  }

  if (gateName === 'runtimePass') {
    return uniqueStrings(
      certification.evidenceSummary.runtime.probes
        .filter((result) => result.status !== 'passed')
        .map((result) => `${result.probeId}:${result.status}`),
    );
  }

  if (gateName === 'syntheticCoveragePass') {
    return certification.evidenceSummary.syntheticCoverage.uncoveredPages.slice(0, 10);
  }

  return [];
}

function determineGateLane(gateName: PulseGateName): PulseConvergenceOwnerLane {
  if (gateName === 'runtimePass' || gateName === 'flowPass') {
    return 'customer';
  }
  if (
    gateName === 'invariantPass' ||
    gateName === 'recoveryPass' ||
    gateName === 'observabilityPass' ||
    gateName === 'performancePass'
  ) {
    return 'reliability';
  }
  if (gateName === 'isolationPass') {
    return 'security';
  }
  return 'platform';
}

function buildGenericGateUnits(input: BuildPulseConvergencePlanInput): PulseConvergenceUnit[] {
  const units: PulseConvergenceUnit[] = [];

  for (const gateName of Object.keys(input.certification.gates) as PulseGateName[]) {
    const gate = input.certification.gates[gateName];
    if (gate.status !== 'fail' || EXCLUDED_GATE_UNITS.has(gateName)) {
      continue;
    }

    const focusList = summarizeGateFocus(gateName, input.certification);
    const artifactPaths = uniqueStrings([
      ...(input.certification.gateEvidence[gateName] || []).flatMap(
        (record) => record.artifactPaths,
      ),
      'PULSE_CERTIFICATE.json',
    ]);
    const failureClass = gate.failureClass || 'unknown';

    units.push({
      id: `gate-${slugify(gateName)}`,
      order: 0,
      priority: GATE_PRIORITY[gateName] || 'P3',
      kind: 'gate',
      status: determineUnitStatus(failureClass),
      ownerLane: determineGateLane(gateName),
      title: `Clear ${humanize(gateName)}`,
      summary: compactText(
        [gate.reason, focusList.length > 0 ? `Current focus: ${focusList.join(', ')}.` : '']
          .filter(Boolean)
          .join(' '),
        320,
      ),
      targetState: `Gate ${gateName} must return pass with fresh evidence on the current commit.`,
      failureClass,
      actorKinds: [],
      gateNames: [gateName],
      scenarioIds: [],
      moduleKeys: [],
      routePatterns: [],
      flowIds:
        gateName === 'flowPass'
          ? uniqueStrings(
              input.certification.evidenceSummary.flows.results
                .filter((result) => result.status !== 'passed')
                .map((result) => result.flowId),
            )
          : [],
      asyncExpectations: [],
      breakTypes: [],
      artifactPaths,
      relatedFiles: [],
      validationArtifacts: artifactPaths,
      exitCriteria: uniqueStrings([
        `Gate ${gateName} returns pass in the next certification run.`,
        focusList.length > 0 ? `Tracked gate focus is resolved: ${focusList.join(', ')}.` : null,
      ]),
    });
  }

  return units;
}

/** Build convergence plan. */
export function buildConvergencePlan(input: BuildPulseConvergencePlanInput): PulseConvergencePlan {
  const queue = [
    ...buildScenarioUnits(input),
    ...buildSecurityUnit(input),
    ...buildGenericGateUnits(input),
    ...buildStaticUnit(input),
  ]
    .sort((left, right) => {
      const priorityDelta = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      const kindDelta = KIND_RANK[left.kind] - KIND_RANK[right.kind];
      if (kindDelta !== 0) {
        return kindDelta;
      }
      return left.title.localeCompare(right.title);
    })
    .map((unit, index) => ({
      ...unit,
      order: index + 1,
    }));

  return {
    generatedAt: input.certification.timestamp,
    commitSha: input.certification.commitSha,
    status: input.certification.status,
    humanReplacementStatus: input.certification.humanReplacementStatus,
    blockingTier: input.certification.blockingTier,
    summary: {
      totalUnits: queue.length,
      scenarioUnits: queue.filter((unit) => unit.kind === 'scenario').length,
      securityUnits: queue.filter((unit) => unit.kind === 'security').length,
      staticUnits: queue.filter((unit) => unit.kind === 'static').length,
      gateUnits: queue.filter((unit) => unit.kind === 'gate').length,
      priorities: {
        P0: queue.filter((unit) => unit.priority === 'P0').length,
        P1: queue.filter((unit) => unit.priority === 'P1').length,
        P2: queue.filter((unit) => unit.priority === 'P2').length,
        P3: queue.filter((unit) => unit.priority === 'P3').length,
      },
      failingGates: (Object.keys(input.certification.gates) as PulseGateName[]).filter(
        (gateName) => input.certification.gates[gateName].status === 'fail',
      ),
      pendingAsyncExpectations:
        input.certification.evidenceSummary.worldState.asyncExpectationsStatus
          .filter((entry) => entry.status !== 'satisfied')
          .map((entry) => `${entry.scenarioId}:${entry.expectation}`)
          .sort(),
    },
    queue,
  };
}

/** Render convergence plan markdown. */
export function renderConvergencePlanMarkdown(plan: PulseConvergencePlan): string {
  const lines: string[] = [];

  lines.push('# PULSE CONVERGENCE PLAN');
  lines.push('');
  lines.push(`- Generated: ${plan.generatedAt}`);
  lines.push(`- Commit: ${plan.commitSha}`);
  lines.push(`- Status: ${plan.status}`);
  lines.push(`- Human Replacement: ${plan.humanReplacementStatus}`);
  lines.push(`- Blocking Tier: ${plan.blockingTier !== null ? plan.blockingTier : 'None'}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Queue length: ${plan.summary.totalUnits}`);
  lines.push(`- Scenario units: ${plan.summary.scenarioUnits}`);
  lines.push(`- Security units: ${plan.summary.securityUnits}`);
  lines.push(`- Gate units: ${plan.summary.gateUnits}`);
  lines.push(`- Static units: ${plan.summary.staticUnits}`);
  lines.push(
    `- Priorities: P0=${plan.summary.priorities.P0}, P1=${plan.summary.priorities.P1}, P2=${plan.summary.priorities.P2}, P3=${plan.summary.priorities.P3}`,
  );
  lines.push(
    `- Failing gates: ${plan.summary.failingGates.length > 0 ? plan.summary.failingGates.join(', ') : 'None'}`,
  );
  lines.push(`- Pending async expectations: ${plan.summary.pendingAsyncExpectations.length}`);
  lines.push('');
  lines.push('## Queue');
  lines.push('');
  lines.push('| Order | Priority | Lane | Kind | Unit | Opened By |');
  lines.push('|-------|----------|------|------|------|-----------|');
  for (const unit of plan.queue) {
    const openedBy =
      uniqueStrings([...unit.gateNames, ...unit.scenarioIds, ...unit.asyncExpectations]).join(
        ', ',
      ) || '—';
    lines.push(
      `| ${unit.order} | ${unit.priority} | ${unit.ownerLane} | ${unit.kind.toUpperCase()} | ${compactText(unit.title, 80)} | ${compactText(openedBy, 120)} |`,
    );
  }
  lines.push('');

  for (const unit of plan.queue) {
    lines.push(`## ${unit.order}. [${unit.priority}] ${unit.title}`);
    lines.push('');
    lines.push(`- Kind: ${unit.kind}`);
    lines.push(`- Status: ${unit.status}`);
    lines.push(`- Lane: ${unit.ownerLane}`);
    lines.push(`- Failure Class: ${unit.failureClass}`);
    lines.push(`- Summary: ${unit.summary}`);
    lines.push(`- Target State: ${unit.targetState}`);
    lines.push(`- Gates: ${unit.gateNames.length > 0 ? unit.gateNames.join(', ') : '—'}`);
    lines.push(`- Scenarios: ${unit.scenarioIds.length > 0 ? unit.scenarioIds.join(', ') : '—'}`);
    lines.push(`- Modules: ${unit.moduleKeys.length > 0 ? unit.moduleKeys.join(', ') : '—'}`);
    lines.push(`- Routes: ${unit.routePatterns.length > 0 ? unit.routePatterns.join(', ') : '—'}`);
    lines.push(`- Flows: ${unit.flowIds.length > 0 ? unit.flowIds.join(', ') : '—'}`);
    lines.push(
      `- Async Expectations: ${unit.asyncExpectations.length > 0 ? unit.asyncExpectations.join(', ') : '—'}`,
    );
    lines.push(`- Break Types: ${unit.breakTypes.length > 0 ? unit.breakTypes.join(', ') : '—'}`);
    lines.push(
      `- Related Files: ${unit.relatedFiles.length > 0 ? unit.relatedFiles.join(', ') : '—'}`,
    );
    lines.push(
      `- Artifacts: ${unit.artifactPaths.length > 0 ? unit.artifactPaths.join(', ') : '—'}`,
    );
    lines.push(
      `- Validation Artifacts: ${unit.validationArtifacts.length > 0 ? unit.validationArtifacts.join(', ') : '—'}`,
    );
    lines.push('- Exit Criteria:');
    if (unit.exitCriteria.length === 0) {
      lines.push('  - None');
    } else {
      for (const criterion of unit.exitCriteria) {
        lines.push(`  - ${criterion}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}
