import { Injectable } from '@nestjs/common';
import type { ExplanationFormat, ExplanationTone, RecommendationExplanation } from './types';
import { clamp, makeIncidentId } from './types';

/**
 * INCENT-001 — RecommendationExplainer.
 *
 * Gera explicação "porque isso, para você" para cada recomendação cruzada.
 * Adapta tom e formato ao perfil do destinatário. Inclui referências a
 * evidências que suportam a recomendação.
 */
@Injectable()
export class RecommendationExplainerService {
  private static readonly DEFAULT_TONE: ExplanationTone = 'transparent';

  private readonly toneTemplates: Record<ExplanationTone, (reason: string) => string> = {
    educational: (r) => `Veja por que esta recomendação faz sentido: ${r}`,
    transparent: (r) => `Por transparência: ${r}`,
    actionable: (r) => `Sugestão prática: ${r}`,
    deferential: (r) => `Com base no que observamos: ${r}`,
  };

  private seq = 0;

  public explain(input: ExplainInput): RecommendationExplanation {
    this.seq += 1;
    const tone = input.preferredTone ?? RecommendationExplainerService.DEFAULT_TONE;
    const formatter = this.toneTemplates[tone];
    const reasonForUser = formatter(input.reason);

    return {
      id: makeIncidentId('expl', this.seq),
      workspaceId: input.workspaceId,
      recommendationId: input.recommendationId,
      recommendationSummary: input.summary,
      reasonForUser,
      evidenceReferences: input.evidence ?? [],
      tone,
      format: this.chooseFormat(input),
      confidenceScore: clamp(input.confidence ?? 0.85, 0, 1),
      explainedAt: new Date().toISOString(),
    };
  }

  public explainBatch(inputs: readonly ExplainInput[]): readonly RecommendationExplanation[] {
    return inputs.map((inp) => this.explain(inp));
  }

  public explainWithLevel(
    input: ExplainInput,
    level: 'brief' | 'detailed' | 'academic',
  ): RecommendationExplanation {
    const formats: Record<string, ExplanationFormat> = {
      brief: 'short',
      detailed: 'medium',
      academic: 'long',
    };
    return this.explain({
      workspaceId: input.workspaceId,
      recommendationId: input.recommendationId,
      summary: input.summary,
      reason: input.reason,
      preferredFormat: formats[level]!,
      ...(input.evidence ? { evidence: input.evidence } : {}),
      ...(input.preferredTone ? { preferredTone: input.preferredTone } : {}),
      ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
    });
  }

  private chooseFormat(input: ExplainInput): ExplanationFormat {
    if (input.preferredFormat) {
      return input.preferredFormat;
    }
    if (input.evidence && input.evidence.length >= 3) {
      return 'long';
    }
    if (input.evidence && input.evidence.length >= 1) {
      return 'medium';
    }
    return 'short';
  }
}

export interface ExplainInput {
  readonly workspaceId: string;
  readonly recommendationId: string;
  readonly summary: string;
  readonly reason: string;
  readonly evidence?: readonly string[];
  readonly preferredTone?: ExplanationTone;
  readonly preferredFormat?: ExplanationFormat;
  readonly confidence?: number;
}
