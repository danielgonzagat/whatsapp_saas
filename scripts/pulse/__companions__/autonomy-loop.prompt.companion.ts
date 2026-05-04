export function buildDeterministicDecision(
  directive: PulseAutonomousDirective,
  validationCommands: string[],
  riskProfile: 'safe' | 'balanced' | 'dangerous',
  previousState?: PulseAutonomyState | null,
): import('./autonomy-loop.types').PulseAutonomyDecision {
  const unit = getFreshAutomationSafeUnits(directive, riskProfile, previousState)[0];
  if (!unit) {
    return buildAdaptiveDecision(directive, validationCommands, riskProfile, previousState);
  }
  return {
    shouldContinue: true,
    selectedUnitId: unit.id,
    rationale:
      'Selected the highest-ranked ai_safe unit from the PULSE decision queue as a deterministic fallback.',
    codexPrompt: buildCodexPrompt(directive, unit),
    validationCommands: buildUnitValidationCommands(directive, unit, validationCommands),
    stopReason: '',
    strategyMode: 'normal',
  };
}
export function coercePlannerDecision(
  value: unknown,
  directive: PulseAutonomousDirective,
  validationCommands: string[],
  riskProfile: 'safe' | 'balanced' | 'dangerous',
  previousState?: PulseAutonomyState | null,
): import('./autonomy-loop.types').PulseAutonomyDecision {
  const candidate = (value || {}) as Record<string, unknown>;
  const shouldContinue = candidate.shouldContinue === true;
  const selectedUnitId =
    typeof candidate.selectedUnitId === 'string' ? candidate.selectedUnitId : '';
  const rationale = typeof candidate.rationale === 'string' ? candidate.rationale : '';
  const codexPrompt = typeof candidate.codexPrompt === 'string' ? candidate.codexPrompt : '';
  const stopReason = typeof candidate.stopReason === 'string' ? candidate.stopReason : '';
  const commandList = Array.isArray(candidate.validationCommands)
    ? unique(
        candidate.validationCommands.filter((entry): entry is string => typeof entry === 'string'),
      )
    : validationCommands;
  const freshUnit =
    getFreshAutomationSafeUnits(directive, riskProfile, previousState).find(
      (unit) => unit.id === selectedUnitId,
    ) || null;
  const chosenUnit =
    getPreferredAutomationSafeUnits(directive, riskProfile, previousState).find(
      (unit) => unit.id === selectedUnitId,
    ) || null;
  const strategyMode = freshUnit || !chosenUnit ? 'normal' : ('adaptive_narrow_scope' as const);
  if (!shouldContinue || !chosenUnit) {
    return {
      shouldContinue: false,
      selectedUnitId: '',
      rationale:
        rationale ||
        'Planner did not return a valid automation-safe ai_safe unit, so the loop will stop safely.',
      codexPrompt: '',
      validationCommands: commandList,
      stopReason: stopReason || 'Planner did not return a valid automation-safe ai_safe unit.',
      strategyMode: 'normal',
    };
  }

  // ── Moved from autonomy-loop.prompt.ts ──────────────────────────────────

  export function summarizeBatchUnits(units: PulseAutonomousDirectiveUnit[]): string {
    return units.map((unit) => unit.title).join(' | ');
  }

  export function buildAdaptiveDecision(
    directive: PulseAutonomousDirective,
    validationCommands: string[],
    riskProfile: 'safe' | 'balanced' | 'dangerous',
    previousState?: PulseAutonomyState | null,
  ): import('./autonomy-loop.types').PulseAutonomyDecision {
    const stalledCandidates = getAutomationSafeUnits(directive, riskProfile);
    const candidate = stalledCandidates.find(
      (unit) => !hasAdaptiveRetryBeenExhausted(previousState, unit.id),
    );
    if (!candidate) {
      return {
        shouldContinue: false,
        selectedUnitId: '',
        rationale:
          'Only previously stalled automation-safe units remain, and adaptive narrow-scope retries are already exhausted.',
        codexPrompt: '',
        validationCommands,
        stopReason:
          'Only previously stalled automation-safe units remain and the adaptive retry path is exhausted.',
        strategyMode: 'adaptive_narrow_scope',
      };
    }
    return {
      shouldContinue: true,
      selectedUnitId: candidate.id,
      rationale:
        'Only stalled automation-safe work remains, so the loop is retrying with a narrower adaptive scope.',
      codexPrompt: buildAdaptivePrompt(directive, candidate),
      validationCommands: buildUnitValidationCommands(directive, candidate, validationCommands),
      stopReason: '',
      strategyMode: 'adaptive_narrow_scope',
    };
  }
  return {
    shouldContinue: true,
    selectedUnitId: chosenUnit.id,
    rationale: rationale || 'Planner selected the next ai_safe unit from the live PULSE directive.',
    codexPrompt:
      strategyMode === 'adaptive_narrow_scope'
        ? buildAdaptivePrompt(directive, chosenUnit, codexPrompt)
        : buildCodexPrompt(directive, chosenUnit, codexPrompt),
    validationCommands: buildUnitValidationCommands(directive, chosenUnit, commandList),
    stopReason: '',
    strategyMode,
  };
}
