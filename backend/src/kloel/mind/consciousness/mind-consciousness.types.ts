/**
 * Type surface for MindConsciousnessService — kept separate so the service
 * file stays under the LOC budget and so other Mind clusters can reuse the
 * narrative shape without dragging the implementation.
 *
 * @cluster Mind/Consciousness
 */

export interface RecentExperience {
  timestamp: string;
  what: string;
  emotionalValence: 'good' | 'bad' | 'neutral';
}

export interface SelfNarrative {
  identity: string;
  currentGoals: string[];
  recentExperiences: RecentExperience[];
  knownLimits: string[];
}

export interface SelfAssessment {
  healthScore: number;
  activeCapabilities: number;
  recentSurprises: number;
  suggestedFocus: string;
}

export interface ExperienceInput {
  what: string;
  outcome: 'good' | 'bad' | 'neutral';
  learnings?: string[];
}

export interface ConsciousnessAutonomyDep {
  propose(workspaceId: string): Promise<{ proposals: Array<{ action: string }> }>;
}

export interface ConsciousnessCaseMemoryDep {
  similar(input: {
    workspaceId: string;
    text: string;
    limit?: number;
    caseType?: string;
  }): Promise<
    Array<{ subject?: string; text?: string; outcome?: number | null; occurredAt: Date }>
  >;
  recordCase(input: {
    workspaceId: string;
    subject: string;
    caseType: string;
    text: string;
    features: Record<string, unknown>;
    action: string;
    outcome?: number;
    occurredAt?: Date;
  }): Promise<unknown>;
}

export interface ConsciousnessGuardAuditDep {
  findRecent(workspaceId: string): Promise<Array<{ guardName: string; reason: string }>>;
}

export interface ConsciousnessHealthDep {
  snapshot(workspaceId: string): Promise<{
    db: string;
    redis: string;
    whatsapp: string;
    llm: string;
  }>;
}

export interface ConsciousnessBeliefDep {
  list(workspaceId: string, predicate: string): Promise<Array<unknown>>;
}

export interface ConsciousnessEventBusDep {
  emit(event: string, payload: unknown): unknown;
}
