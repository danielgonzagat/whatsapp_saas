export interface OwnerAction {
  readonly id: string;
  readonly workspaceId: string;
  readonly description: string;
  readonly createdAt: string;
  readonly lastProgressAt: string | null;
  readonly priority: 'critical' | 'high' | 'medium' | 'low';
  readonly category: ActionCategory;
  readonly estimatedMinutes: number;
  readonly hasExternalDependency: boolean;
  readonly externalDependencyDescription: string | null;
}

export type ActionCategory =
  | 'technical'
  | 'creative'
  | 'strategic'
  | 'operational'
  | 'commercial';

export type FrictionKind =
  | 'stalled'
  | 'abandoned'
  | 'never_started'
  | 'overwhelmed'
  | 'blocked';

export const HOURS_24_MS = 24 * 60 * 60 * 1000;

export interface FrictionDetection {
  readonly id: string;
  readonly workspaceId: string;
  readonly actionId: string;
  readonly actionDescription: string;
  readonly hoursStuck: number;
  readonly frictionKind: FrictionKind;
  readonly frictionScore: number;
  readonly signals: readonly string[];
  readonly recommendation: string;
  readonly detectedAt: string;
}

export interface ComplexActionInput {
  readonly workspaceId: string;
  readonly actionDescription: string;
  readonly totalEstimatedMinutes: number;
  readonly complexity: 'simple' | 'moderate' | 'complex' | 'very_complex';
  readonly hasDependencies: boolean;
  readonly priorKnowledgeLevel: 'none' | 'partial' | 'full';
  readonly availableTools: readonly string[];
}

export interface MicroStep {
  readonly step: number;
  readonly description: string;
  readonly estimatedMinutes: number;
  readonly hasAssistedExecutionOption: boolean;
  readonly assistedExecutionDescription: string | null;
  readonly prerequisites: readonly string[];
}

export interface StepDecompositionResult {
  readonly id: string;
  readonly workspaceId: string;
  readonly originalAction: string;
  readonly steps: readonly MicroStep[];
  readonly totalEstimatedMinutes: number;
  readonly firstStepMinutes: number;
  readonly decomposedAt: string;
}
