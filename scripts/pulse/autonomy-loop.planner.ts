/**
 * Agent-based and deterministic planner for the autonomy loop.
 */
import { Agent, MemorySession, run, tool } from '@openai/agents';
import type { PulseAutonomyState } from './types';
import type {
  PulseAutonomousDirective,
  PulseAutonomyDecision,
  PulseRollbackGuard,
  PLANNER_OUTPUT_SCHEMA as PlannerOutputSchemaType,
  READ_PULSE_ARTIFACT_TOOL_SCHEMA as ReadArtifactSchemaType,
} from './autonomy-loop.types';
import {
  PLANNER_OUTPUT_SCHEMA,
  READ_PULSE_ARTIFACT_TOOL_SCHEMA,
  AUTONOMY_ARTIFACT,
  DEFAULT_PLANNER_MODEL,
} from './autonomy-loop.types';
import {
  compact,
  unique,
  readCanonicalArtifact,
  commandExists,
  readAgentsSdkVersion,
} from './autonomy-loop.utils';
import {
  getFreshAutomationSafeUnits,
  getPreferredAutomationSafeUnits,
  getAutomationSafeUnits,
  hasAdaptiveRetryBeenExhausted,
} from './autonomy-loop.unit-ranking';
import {
  buildCodexPrompt,
  buildAdaptivePrompt,
  buildBatchValidationCommands,
  buildUnitValidationCommands,
  buildPlannerPrompt,
} from './autonomy-loop.prompt';

export function buildDeterministicDecision(
  directive: PulseAutonomousDirective,
  validationCommands: string[],
  riskProfile: 'safe' | 'balanced' | 'dangerous',
  previousState?: PulseAutonomyState | null,
): PulseAutonomyDecision {
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

export function buildAdaptiveDecision(
  directive: PulseAutonomousDirective,
  validationCommands: string[],
  riskProfile: 'safe' | 'balanced' | 'dangerous',
  previousState?: PulseAutonomyState | null,
): PulseAutonomyDecision {
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

export function coercePlannerDecision(
  value: unknown,
  directive: PulseAutonomousDirective,
  validationCommands: string[],
  riskProfile: 'safe' | 'balanced' | 'dangerous',
  previousState?: PulseAutonomyState | null,
): PulseAutonomyDecision {
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

export function buildPlannerAgent(
  rootDir: string,
  plannerModel: string,
  riskProfile: 'safe' | 'balanced' | 'dangerous',
) {
  const readPulseArtifact = tool({
    name: 'read_pulse_artifact',
    description:
      'Read a canonical PULSE artifact when the prompt summary is not enough to choose the next ai_safe autonomous unit.',
    parameters: READ_PULSE_ARTIFACT_TOOL_SCHEMA,
    strict: true,
    execute: async ({ artifact }: { artifact: string }) => {
      const relativePath =
        artifact === 'directive'
          ? 'PULSE_CLI_DIRECTIVE.json'
          : artifact === 'convergence'
            ? 'PULSE_CONVERGENCE_PLAN.json'
            : artifact === 'vision'
              ? 'PULSE_PRODUCT_VISION.json'
              : artifact === 'external_signals'
                ? 'PULSE_EXTERNAL_SIGNAL_STATE.json'
                : AUTONOMY_ARTIFACT;
      const value = readCanonicalArtifact(rootDir, relativePath);
      if (!value) {
        return JSON.stringify(
          {
            artifact,
            available: false,
            summary: 'Artifact not found yet.',
          },
          null,
          2,
        );
      }
      return JSON.stringify(
        {
          artifact,
          available: true,
          payload: value,
        },
        null,
        2,
      );
    },
  });

  return new Agent({
    name: 'pulse_autonomy_planner',
    handoffDescription: 'Chooses the next safe autonomous coding step from live PULSE artifacts.',
    instructions: [
      'You are the PULSE autonomy planner.',
      'Choose the single best ai_safe convergence unit for Codex to execute next.',
      'Never choose human_required or observation_only work.',
      riskProfile === 'dangerous'
        ? 'Dangerous profile is enabled: you may choose any ai_safe unit, including high-risk ones, but never cross governance boundaries.'
        : 'Never choose units marked with high/critical riskLevel or units with a very wide blast radius.',
      'Prefer units with transformational or material product impact over diagnostic-only work.',
      'Prefer the earliest ai_safe unit when two options are otherwise equivalent.',
      'If the directive already reports CERTIFIED, or if no ai_safe unit remains, set shouldContinue=false.',
      'The codexPrompt must instruct Codex to obey AGENTS.md, stay within repo boundaries, make real changes, run validation, and stop only after materially improving the repo state or hitting a real blocker.',
      'Do not claim success that has not been validated.',
      'Return strict JSON that matches the schema.',
    ].join(' '),
    model: plannerModel,
    tools: [readPulseArtifact],
    outputType: PLANNER_OUTPUT_SCHEMA,
  });
}

export async function planWithAgent(
  rootDir: string,
  directive: PulseAutonomousDirective,
  previousState: PulseAutonomyState | null,
  plannerModel: string,
  validationCommands: string[],
  riskProfile: 'safe' | 'balanced' | 'dangerous',
): Promise<PulseAutonomyDecision> {
  const agent = buildPlannerAgent(rootDir, plannerModel, riskProfile);
  const session = new MemorySession({ sessionId: 'pulse-autonomy-planner' });
  const result = await run(agent, buildPlannerPrompt(directive, previousState, riskProfile), {
    maxTurns: 8,
    session,
  });
  return coercePlannerDecision(
    result.finalOutput,
    directive,
    validationCommands,
    riskProfile,
    previousState,
  );
}

export function determinePlannerMode(
  disableAgentPlanner: boolean,
  rootDir: string,
): 'agents_sdk' | 'deterministic' {
  if (disableAgentPlanner) {
    return 'deterministic';
  }
  return Boolean(process.env.OPENAI_API_KEY) && readAgentsSdkVersion(rootDir)
    ? 'agents_sdk'
    : 'deterministic';
}

export function shouldStopForDirective(
  directive: PulseAutonomousDirective,
  riskProfile: 'safe' | 'balanced' | 'dangerous',
  previousState?: PulseAutonomyState | null,
): string | null {
  if (directive.currentState?.certificationStatus === 'CERTIFIED') {
    return 'PULSE is already certified for the current checkpoint.';
  }
  const automationSafeUnits = getAutomationSafeUnits(directive, riskProfile);
  if (automationSafeUnits.length === 0) {
    return 'No automation-safe ai_safe convergence units remain in the current directive.';
  }
  if (getFreshAutomationSafeUnits(directive, riskProfile, previousState).length === 0) {
    const adaptiveCandidateExists = automationSafeUnits.some(
      (unit) => !hasAdaptiveRetryBeenExhausted(previousState, unit.id),
    );
    if (!adaptiveCandidateExists) {
      return 'Only previously stalled automation-safe units remain in the current directive and the adaptive retry path is exhausted.';
    }
  }
  return null;
}
