import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Hypothesis, MicroExperiment } from './types';

interface ExperimentTemplate {
  readonly minEvidence: number;
  readonly maxDurationMs: number;
  readonly riskAssessment: 'safe' | 'normal' | 'high';
  readonly targetMetric: string;
  readonly descriptionTemplate: (hypothesis: Hypothesis) => string;
}

const DOMAIN_TEMPLATES: ReadonlyMap<string, ExperimentTemplate> = new Map([
  [
    'lead_response',
    {
      minEvidence: 5,
      maxDurationMs: 3 * 24 * 60 * 60 * 1000,
      riskAssessment: 'normal',
      targetMetric: 'lead_reengagement_rate',
      descriptionTemplate: (h) =>
        `Measure whether re-engagement strategy improves lead response rate. Hypothesis: ${h.statement}`,
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
    };
  }
}
