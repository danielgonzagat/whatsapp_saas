import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  AutonomyMode,
  CommercialRiskClass,
  Hypothesis,
  MicroExperiment,
  ProofTargetLevel,
} from './types';

interface ExperimentTemplate {
  readonly minEvidence: number;
  readonly maxDurationMs: number;
  readonly riskAssessment: 'safe' | 'normal' | 'high';
  readonly targetMetric: string;
  readonly descriptionTemplate: (hypothesis: Hypothesis) => string;
  readonly commercialWork: string;
  readonly riskClass: CommercialRiskClass;
  readonly autonomyMode: AutonomyMode;
  readonly proofLevelTarget: ProofTargetLevel;
  readonly validationScene: string;
  readonly noFaithProofSignal: string;
  readonly leadLeavesBetterCheck: string;
}

const DOMAIN_TEMPLATES: ReadonlyMap<string, ExperimentTemplate> = new Map([
  [
    'lead_response',
    {
      minEvidence: 5,
      maxDurationMs: 3 * 24 * 60 * 60 * 1000,
      riskAssessment: 'safe',
      targetMetric: 'lead_reengagement_rate',
      descriptionTemplate: (h) =>
        `Decide the safest next test before contacting an insecure lead. Hypothesis: ${h.statement}`,
      commercialWork:
        'decide whether to wait, explain, escalate, or test a low-risk recovery before sending a message',
      riskClass: 'R1',
      autonomyMode: 'alone',
      proofLevelTarget: 'N3',
      validationScene: 'Lead interessado, mas inseguro / silencio apos objecao real',
      noFaithProofSignal: 'owner sees a concrete next-step decision before every lead-facing action',
      leadLeavesBetterCheck:
        'test must not add pressure, fake urgency, or discount framing before diagnosis',
    },
  ],
  [
    'churn_prevention',
    {
      minEvidence: 3,
      maxDurationMs: 7 * 24 * 60 * 60 * 1000,
      riskAssessment: 'normal',
      targetMetric: 'churn_reduction_rate',
      descriptionTemplate: (h) =>
        `Measure whether churn prevention tactic reduces customer loss. Hypothesis: ${h.statement}`,
      commercialWork:
        'decide the safest retention test before contacting a customer with regret risk',
      riskClass: 'R2',
      autonomyMode: 'approval',
      proofLevelTarget: 'N3',
      validationScene: 'Cliente pos-compra com risco de arrependimento',
      noFaithProofSignal: 'owner sees the reason for a retention move before approval',
      leadLeavesBetterCheck:
        'message must clarify expectation and reduce regret instead of trapping the customer',
    },
  ],
  [
    'deal_progression',
    {
      minEvidence: 3,
      maxDurationMs: 5 * 24 * 60 * 60 * 1000,
      riskAssessment: 'safe',
      targetMetric: 'deal_acceleration_days',
      descriptionTemplate: (h) =>
        `Measure whether next-step discipline accelerates deal closure. Hypothesis: ${h.statement}`,
      commercialWork: 'decide the next measurable deal step without adding extra dashboard work',
      riskClass: 'R1',
      autonomyMode: 'alone',
      proofLevelTarget: 'N3',
      validationScene: 'Dono perdido sem saber o que fazer agora',
      noFaithProofSignal: 'owner receives a next step with deadline and reason',
      leadLeavesBetterCheck: 'next step must clarify decision criteria instead of pushing urgency',
    },
  ],
  [
    'whatsapp_engagement',
    {
      minEvidence: 3,
      maxDurationMs: 3 * 24 * 60 * 60 * 1000,
      riskAssessment: 'safe',
      targetMetric: 'handoff_reduction_rate',
      descriptionTemplate: (h) =>
        `Measure whether bot role clarity reduces human handoff. Hypothesis: ${h.statement}`,
      commercialWork: 'decide when the system should hand off without making the human look worse',
      riskClass: 'R1',
      autonomyMode: 'alone',
      proofLevelTarget: 'N3',
      validationScene: 'Time humano esquecendo follow-up',
      noFaithProofSignal: 'handoff reason is visible without understanding architecture',
      leadLeavesBetterCheck:
        'handoff must preserve context and dignity instead of blaming the team',
    },
  ],
]);

@Injectable()
export class MicroExperimentDesignerService {
  private readonly logger = new Logger(MicroExperimentDesignerService.name);

  design(hypothesis: Hypothesis): MicroExperiment | null {
    const template = DOMAIN_TEMPLATES.get(hypothesis.domain);
    if (!template) {
      this.logger.warn(`No experiment template for domain: ${hypothesis.domain}`);
      return null;
    }

    if (hypothesis.confidence < 0.4) {
      this.logger.debug(`Hypothesis ${hypothesis.id} confidence too low for experiment`);
      return null;
    }

    const correlationId = `hypproof_${hypothesis.id}`;

    return {
      id: `exp_${randomUUID()}`,
      hypothesisId: hypothesis.id,
      workspaceId: hypothesis.workspaceId,
      description: template.descriptionTemplate(hypothesis),
      riskAssessment: template.riskAssessment,
      targetMetric: template.targetMetric,
      evidenceThreshold: template.minEvidence,
      maxDurationMs: template.maxDurationMs,
      designedAt: new Date().toISOString(),
      correlationId,
      commercialWork: template.commercialWork,
      riskClass: template.riskClass,
      autonomyMode: template.autonomyMode,
      proofLevelTarget: template.proofLevelTarget,
      validationScene: template.validationScene,
      noFaithProofSignal: template.noFaithProofSignal,
      leadLeavesBetterCheck: template.leadLeavesBetterCheck,
    };
  }
}
