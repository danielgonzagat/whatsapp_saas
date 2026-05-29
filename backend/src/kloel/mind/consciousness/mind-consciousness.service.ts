import { Injectable, Logger, Optional } from '@nestjs/common';
import type {
  ConsciousnessAutonomyDep,
  ConsciousnessBeliefDep,
  ConsciousnessCaseMemoryDep,
  ConsciousnessEventBusDep,
  ConsciousnessGuardAuditDep,
  ConsciousnessHealthDep,
  ExperienceInput,
  RecentExperience,
  SelfAssessment,
  SelfNarrative,
} from './mind-consciousness.types';

const KLOEL_IDENTITY =
  'Kloel — agente comercial e operacional AI-native do workspace, ' +
  'projetado para vender, atender e aprender com cada interação real.';

const DEFAULT_LIMITS: readonly string[] = [
  'sem acesso direto a dados de produção sem autorização',
  'não opera pagamentos sem confirmação humana',
  'não inventa produtos, preços ou políticas',
];

const HEALTH_TOKENS_OK = new Set(['ok', 'connected']);
const HEALTH_TOKENS_DEGRADED = new Set(['degraded', 'unknown']);
const HEALTH_MAX = 100;
const HEALTH_DEGRADED_PENALTY = 10;
const HEALTH_DOWN_PENALTY = 25;
const RECENT_EXPERIENCE_LIMIT = 10;
const RECENT_GOALS_LIMIT = 8;
const RECENT_GUARD_LIMIT = 8;
const FOCUS_HEALTH_THRESHOLD = 60;
const FOCUS_SURPRISE_THRESHOLD = 5;

/**
 * MindConsciousnessService — synthesizes a workspace-scoped self-narrative,
 * records first-person experiences and produces a self-assessment.
 *
 * Honest contract: every collaborator is @Optional. When a dependency is
 * missing the service degrades to a real, narrow answer rather than faking
 * data.
 *
 * @cluster Mind/Consciousness
 */
@Injectable()
export class MindConsciousnessService {
  private readonly logger = new Logger(MindConsciousnessService.name);

  constructor(
    @Optional() private readonly autonomy?: ConsciousnessAutonomyDep,
    @Optional() private readonly caseMemory?: ConsciousnessCaseMemoryDep,
    @Optional() private readonly guardAudit?: ConsciousnessGuardAuditDep,
    @Optional() private readonly health?: ConsciousnessHealthDep,
    @Optional() private readonly belief?: ConsciousnessBeliefDep,
    @Optional() private readonly eventBus?: ConsciousnessEventBusDep,
  ) {}

  async getSelfNarrative(workspaceId: string): Promise<SelfNarrative> {
    this.assertWorkspace(workspaceId);
    const [goals, recent, limits] = await Promise.all([
      this.collectGoals(workspaceId),
      this.collectRecentExperiences(workspaceId),
      this.collectKnownLimits(workspaceId),
    ]);
    return {
      identity: KLOEL_IDENTITY,
      currentGoals: goals,
      recentExperiences: recent,
      knownLimits: limits,
    };
  }

  async recordExperience(workspaceId: string, experience: ExperienceInput): Promise<void> {
    this.assertWorkspace(workspaceId);
    const what = (experience.what ?? '').trim();
    if (!what) {
      return;
    }
    const outcomeScore = MindConsciousnessService.outcomeToScore(experience.outcome);
    const features: Record<string, unknown> = {
      valence: experience.outcome,
      learnings: experience.learnings ?? [],
    };
    await this.safeRecord(workspaceId, what, features, outcomeScore);
    this.safeEmit(workspaceId, what, experience);
  }

  async selfAssess(workspaceId: string): Promise<SelfAssessment> {
    this.assertWorkspace(workspaceId);
    const [healthScore, capabilities, surprises] = await Promise.all([
      this.scoreHealth(workspaceId),
      this.countCapabilities(workspaceId),
      this.countRecentSurprises(workspaceId),
    ]);
    return {
      healthScore,
      activeCapabilities: capabilities,
      recentSurprises: surprises,
      suggestedFocus: this.suggestFocus(healthScore, surprises),
    };
  }

  private async safeRecord(
    workspaceId: string,
    what: string,
    features: Record<string, unknown>,
    outcomeScore: number,
  ): Promise<void> {
    try {
      await this.caseMemory?.recordCase({
        workspaceId,
        subject: 'self',
        caseType: 'consciousness.experience',
        text: what,
        features,
        action: 'record',
        outcome: outcomeScore,
        occurredAt: new Date(),
      });
    } catch (error: unknown) {
      this.logger.warn({
        operation: 'mind.consciousness.record_experience',
        status: 'error',
        workspaceId,
        errorCode: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  private safeEmit(workspaceId: string, what: string, experience: ExperienceInput): void {
    try {
      this.eventBus?.emit('cognition.consciousness.experience_recorded', {
        workspaceId,
        what,
        outcome: experience.outcome,
        learnings: experience.learnings ?? [],
        recordedAt: new Date().toISOString(),
      });
    } catch (error: unknown) {
      this.logger.warn({
        operation: 'mind.consciousness.emit',
        status: 'error',
        workspaceId,
        errorCode: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  private async collectGoals(workspaceId: string): Promise<string[]> {
    if (!this.autonomy) {
      return [];
    }
    try {
      const proposal = await this.autonomy.propose(workspaceId);
      return proposal.proposals.map((p) => p.action).slice(0, RECENT_GOALS_LIMIT);
    } catch {
      return [];
    }
  }

  private async collectRecentExperiences(workspaceId: string): Promise<RecentExperience[]> {
    if (!this.caseMemory) {
      return [];
    }
    try {
      const rows = await this.caseMemory.similar({
        workspaceId,
        text: 'self',
        caseType: 'consciousness.experience',
        limit: RECENT_EXPERIENCE_LIMIT,
      });
      return rows.map((row) => ({
        timestamp: new Date(row.occurredAt).toISOString(),
        what: String(row.text ?? row.subject ?? 'experiência sem descrição'),
        emotionalValence: MindConsciousnessService.scoreToOutcome(row.outcome ?? null),
      }));
    } catch {
      return [];
    }
  }

  private async collectKnownLimits(workspaceId: string): Promise<string[]> {
    if (!this.guardAudit) {
      return [...DEFAULT_LIMITS];
    }
    try {
      const audits = await this.guardAudit.findRecent(workspaceId);
      const seen = new Set<string>();
      const dynamic: string[] = [];
      for (const audit of audits) {
        const phrase = `${audit.guardName}: ${audit.reason}`;
        if (!seen.has(phrase)) {
          seen.add(phrase);
          dynamic.push(phrase);
        }
      }
      return [...DEFAULT_LIMITS, ...dynamic.slice(0, RECENT_GUARD_LIMIT)];
    } catch {
      return [...DEFAULT_LIMITS];
    }
  }

  private async scoreHealth(workspaceId: string): Promise<number> {
    if (!this.health) return 0;
    try {
      const snapshot = await this.health.snapshot(workspaceId);
      let score = HEALTH_MAX;
      for (const value of Object.values(snapshot)) {
        if (HEALTH_TOKENS_OK.has(value)) continue;
        score -= HEALTH_TOKENS_DEGRADED.has(value)
          ? HEALTH_DEGRADED_PENALTY
          : HEALTH_DOWN_PENALTY;
      }
      return Math.max(0, score);
    } catch {
      return 0;
    }
  }

  private async countCapabilities(workspaceId: string): Promise<number> {
    if (!this.belief) return 0;
    try {
      const rows = await this.belief.list(workspaceId, 'capability.active');
      return rows.length;
    } catch {
      return 0;
    }
  }

  private async countRecentSurprises(workspaceId: string): Promise<number> {
    if (!this.guardAudit) return 0;
    try {
      const rows = await this.guardAudit.findRecent(workspaceId);
      return rows.length;
    } catch {
      return 0;
    }
  }

  private suggestFocus(healthScore: number, surprises: number): string {
    if (healthScore === 0) return 'configurar telemetria mínima';
    if (healthScore < FOCUS_HEALTH_THRESHOLD) return 'restaurar saúde de infraestrutura';
    if (surprises > FOCUS_SURPRISE_THRESHOLD) return 'investigar guard-audit recente';
    return 'continuar evoluindo capacidades';
  }

  private assertWorkspace(workspaceId: string): void {
    if (!workspaceId) {
      throw new Error('mind_consciousness_workspace_required');
    }
  }

  private static outcomeToScore(outcome: ExperienceInput['outcome']): number {
    if (outcome === 'good') return 1;
    if (outcome === 'bad') return -1;
    return 0;
  }

  private static scoreToOutcome(score: number | null): RecentExperience['emotionalValence'] {
    if (score === null || score === undefined) return 'neutral';
    if (score > 0) return 'good';
    if (score < 0) return 'bad';
    return 'neutral';
  }
}
