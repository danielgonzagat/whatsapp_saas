import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Hypothesis, ProofEvaluation, DiscoveryNarrative } from './types';

@Injectable()
export class DiscoveryNarrativeBuilderService {
  private readonly logger = new Logger(DiscoveryNarrativeBuilderService.name);

  build(hypothesis: Hypothesis, evaluation: ProofEvaluation): DiscoveryNarrative | null {
    if (!evaluation) {
      return null;
    }

    const headline = buildHeadline(evaluation.verdict, hypothesis.domain);
    const body = buildBody(hypothesis, evaluation);

    this.logger.debug(
      `Narrative built for hypothesis ${hypothesis.id}: ${headline}`,
    );

    return {
      id: `nar_${randomUUID()}`,
      workspaceId: evaluation.workspaceId,
      hypothesisId: hypothesis.id,
      correlationId: evaluation.correlationId,
      headline,
      body,
      verdict: evaluation.verdict,
      confidence: evaluation.confidence,
      evidenceCount: evaluation.evidenceCount,
      generatedAt: new Date().toISOString(),
    };
  }
}

function buildHeadline(verdict: string, domain: string): string {
  const domainLabel = formatDomainLabel(domain);
  if (verdict === 'confirmed') {
    return `Hypothesis confirmed — our ${domainLabel} strategy works.`;
  }
  if (verdict === 'refuted') {
    return `Our ${domainLabel} hypothesis was not supported — time to adapt.`;
  }
  return `Our ${domainLabel} experiment is inconclusive — more data needed.`;
}

function buildBody(hypothesis: Hypothesis, evaluation: ProofEvaluation): string {
  const verdictLabel =
    evaluation.verdict === 'confirmed'
      ? 'confirm'
      : evaluation.verdict === 'refuted'
        ? 'refute'
        : 'leave inconclusive';

  return [
    `We tested the hypothesis: "${hypothesis.statement}"`,
    `After observing ${evaluation.evidenceCount} data points, the results ${verdictLabel} this claim.`,
    `The measured effect showed a mean delta of ${evaluation.meanDelta >= 0 ? '+' : ''}${evaluation.meanDelta.toFixed(3)}`,
    `with ${(evaluation.confidence * 100).toFixed(0)}% confidence in the observations.`,
    evaluation.verdict === 'inconclusive'
      ? 'We recommend collecting additional evidence before making a decision.'
      : evaluation.verdict === 'confirmed'
        ? 'We recommend adopting this strategy and measuring long-term impact.'
        : 'We recommend revisiting the hypothesis and designing an alternative experiment.',
  ].join(' ');
}

function formatDomainLabel(domain: string): string {
  return domain
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
