/**
 * Evaluate the set of transition gates for a specific level transition.
 *
 * @param currentLevel  The authority level being transitioned from.
 * @param targetLevel   The authority level being transitioned to.
 * @param rootDir       Absolute path to the repository root.
 * @returns Array of evaluated transition gates.
 */
export function evaluateTransitionGates(
  currentLevel: AuthorityLevel,
  targetLevel: AuthorityLevel,
  rootDir: string,
): AuthorityTransitionGate[] {
  if (!isValidTransition(currentLevel, targetLevel)) {
    return [];
  }

  const resolvedRoot = resolveRoot(rootDir);
  const certificate = loadCertificate(resolvedRoot);

  if (!certificate) {
    const required = !certificate;
    return [
      {
        required,
        passed: false,
        name: 'certificateAvailable',
        description: 'PULSE_CERTIFICATE.json must exist and be parseable',
        evidence: ['Certificate file not found or invalid'],
      },
    ];
  }

  const gateNames = requiredGatesForCertificateLevel(certificate, targetLevel);
  const gates: AuthorityTransitionGate[] = gateNames.map((name) => {
    const result = evaluateCertificateGate(certificate, name);
    const required = name.length > 0;
    return {
      required,
      passed: result.passed,
      name,
      description: gateDescription(name, certificate),
      evidence: result.evidence,
    };
  });

  // Append synthetic gates for production_authority (fullE2E, noRegression)
  if (targetLevel === 'production_authority') {
    const e2eResult = checkFullE2E(certificate);
    const e2eRequired = gateNames.length > 0;
    gates.push({
      required: e2eRequired,
      passed: e2eResult.passed,
      name: 'fullE2E',
      description: 'Terminal certification tier has no failing gate evidence',
      evidence: e2eResult.evidence,
    });

    const regressionResult = checkNoRegression(resolvedRoot);
    const regressionRequired = Boolean(certificate.score);
    gates.push({
      required: regressionRequired,
      passed: regressionResult.passed,
      name: 'noRegression',
      description: 'No regression detected — gate status stable across cycles',
      evidence: regressionResult.evidence,
    });
  }

  // Append external reality check using machine readiness
  const machineReadiness = loadMachineReadiness(resolvedRoot);
  if (machineReadiness) {
    const externalSignal = evaluateMachineReadinessCriterion(machineReadiness, 'external_reality');
    gates.push({
      required: targetLevel !== 'advisory_only' && targetLevel !== 'operator_gated',
      passed: externalSignal.passed,
      name: 'externalReality',
      description:
        'Runtime signals confirm static analysis — external evidence matches internal claims',
      evidence: externalSignal.evidence,
    });

    const selfTrustCrit = evaluateMachineReadinessCriterion(machineReadiness, 'self_trust');
    gates.push({
      required: targetLevel !== 'advisory_only' && targetLevel !== 'operator_gated',
      passed: selfTrustCrit.passed,
      name: 'selfTrust',
      description: 'AI agent can trust its own judgments based on multi-cycle consistency',
      evidence: selfTrustCrit.evidence,
    });

    const multiCycleCrit = evaluateMachineReadinessCriterion(machineReadiness, 'multi_cycle');
    gates.push({
      required: targetLevel !== 'advisory_only' && targetLevel !== 'operator_gated',
      passed: multiCycleCrit.passed,
      name: 'multiCycle',
      description: '3 consecutive non-regressing autonomous cycles completed',
      evidence: multiCycleCrit.evidence,
    });
  }

  return gates;
}

/**
 * Whether the authority can advance to a target level given the current state.
 *
 * @param state        Current authority state.
 * @param targetLevel  Desired target level.
 * @returns `true` if all required gates pass and the transition is valid.
 */
export function canAdvanceTo(state: AuthorityState, targetLevel: AuthorityLevel): boolean {
  if (!isValidTransition(state.currentLevel, targetLevel)) return false;

  const gates = state.transitions[targetLevel];
  if (!gates || gates.length === 0) return false;

  return gates.every((g) => !g.required || g.passed);
}

/**
 * Advance the authority state to a new level and record the transition.
 *
 * @param state        Current authority state.
 * @param targetLevel  The level to advance to.
 * @param reason       Human-readable justification for the advancement.
 * @returns A new authority state reflecting the transition, or the original
 *          if advancement is blocked.
 */
export function advanceTo(
  state: AuthorityState,
  targetLevel: AuthorityLevel,
  reason: string,
): AuthorityState {
  if (!isValidTransition(state.currentLevel, targetLevel)) return state;

  const gates = state.transitions[targetLevel];
  if (!gates) return state;

  const allPassed = gates.every((g) => !g.required || g.passed);
  if (!allPassed) return state;

  const now = new Date().toISOString();

  return {
    ...state,
    currentLevel: targetLevel,
    targetLevel: findNextLevel(targetLevel),
    lastAdvanced: now,
    history: [
      ...state.history,
      {
        from: state.currentLevel,
        to: targetLevel,
        at: now,
        reason,
      },
    ],
    blockingGates: [],
    canAdvance: false,
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function findNextLevel(current: AuthorityLevel): AuthorityLevel {
  const idx = LEVEL_ORDER.indexOf(current);
  if (idx < 0 || idx >= LEVEL_ORDER.length - 1) return current;
  return LEVEL_ORDER[idx + 1];
}

function isValidTransition(from: AuthorityLevel, to: AuthorityLevel): boolean {
  const fromIdx = LEVEL_ORDER.indexOf(from);
  const toIdx = LEVEL_ORDER.indexOf(to);
  return toIdx > fromIdx && toIdx <= fromIdx + 1;
}

function evaluateAllTransitions(
  rootDir: string,
  certificate: PulseCertification | null,
  currentLevel: AuthorityLevel,
): Record<AuthorityLevel, AuthorityTransitionGate[]> {
  const result = {} as Record<AuthorityLevel, AuthorityTransitionGate[]>;

  for (const level of LEVEL_ORDER) {
    if (LEVEL_ORDER.indexOf(level) <= LEVEL_ORDER.indexOf(currentLevel)) {
      result[level] = [];
      continue;
    }

    if (!certificate) {
      const required = !certificate;
      result[level] = [
        {
          required,
          passed: false,
          name: 'certificateAvailable',
          description: 'PULSE_CERTIFICATE.json must exist and be parseable',
          evidence: ['Certificate file not found or invalid'],
        },
      ];
      continue;
    }

    result[level] = evaluateTransitionGates(currentLevel, level, rootDir);
  }

  return result;
}

function collectBlockingGates(
  transitions: Record<AuthorityLevel, AuthorityTransitionGate[]>,
  targetLevel: AuthorityLevel,
): string[] {
  const gates = transitions[targetLevel];
  if (!gates) return [];
  return gates.filter((g) => g.required && !g.passed).map((g) => g.name);
}

