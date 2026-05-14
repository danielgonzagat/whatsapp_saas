export interface ExecutionFriction {
  readonly id: string;
  readonly workspaceId: string;
  readonly targetAction: string;
  readonly frictionType: 'overwhelm' | 'ambiguity' | 'unknown_first_step' | 'perfectionism' | 'scope_creep' | 'external_blocker';
  readonly frictionScore: number;
  readonly detectedSignals: readonly string[];
  readonly recommendation: string;
  readonly detectedAt: string;
}

export interface StepDecomposition {
  readonly id: string;
  readonly workspaceId: string;
  readonly originalAction: string;
  readonly steps: readonly TinyStep[];
  readonly totalEstimatedMinutes: number;
  readonly firstStepMinutes: number;
  readonly decomposedAt: string;
}

export interface TinyStep {
  readonly order: number;
  readonly description: string;
  readonly estimatedMinutes: number;
  readonly isAtomic: boolean;
  readonly completionSignal: string;
}

export interface TinyAction {
  readonly id: string;
  readonly workspaceId: string;
  readonly parentAction: string;
  readonly description: string;
  readonly estimatedMinutes: number;
  readonly contextHelp: string;
  readonly motivationAnchor: string;
  readonly suggestedAt: string;
}

export interface PartialExecutionOffer {
  readonly id: string;
  readonly workspaceId: string;
  readonly originalAction: string;
  readonly partialVersion: string;
  readonly savedTimePercent: number;
  readonly valueRetainedPercent: number;
  readonly rationale: string;
  readonly generatedAt: string;
}

export interface AlternativeRoute {
  readonly id: string;
  readonly workspaceId: string;
  readonly blockedAction: string;
  readonly blocker: string;
  readonly alternativeAction: string;
  readonly effortRatio: number;
  readonly outcomeProximity: number;
  readonly generatedAt: string;
}

export interface BlockingPattern {
  readonly id: string;
  readonly workspaceId: string;
  readonly patternType: 'analysis_paralysis' | 'waiting_on_external' | 'fear_of_imperfect' | 'too_many_options' | 'low_energy_state' | 'unclear_payoff' | 'dependency_chain' | 'capacity_overload';
  readonly frequency: number;
  readonly lastOccurrenceAt: string;
  readonly evidenceTrack: readonly string[];
  readonly ownerCriterionFeed: string;
  readonly learnedAt: string;
}

export interface NoBlameTone {
  readonly originalText: string;
  readonly rewrittenText: string;
  readonly blameMarkersRemoved: readonly string[];
  readonly toneShift: 'directive_to_invitational' | 'accusatory_to_observational' | 'absolute_to_contextual' | 'past_focus_to_future_focus';
  readonly rewrittenAt: string;
}
