import { Injectable, Logger } from '@nestjs/common';
import type {
  RevenueQualityInput,
  RevenueQualityResult,
  RevenueQualityDimensions,
  RevenueClassification,
} from './healthymoney.types';
import {
  DEFAULT_WEIGHTS,
  HEALTHY_THRESHOLD,
  UNHEALTHY_THRESHOLD,
  SUPPORT_COST_CAP_RATIO,
  LTV_MULTIPLIER_THRESHOLD,
} from './healthymoney.types';
import { clamp } from '../../common/math';

function ratioOrZero(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

const DIMENSION_LABELS: Record<string, string> = {
  marginScore: 'Margem bruta',
  refundScore: 'Risco de reembolso',
  supportScore: 'Custo de suporte projetado',
  churnScore: 'Risco de churn',
  brandScore: 'Risco de desgaste de marca',
  ltvScore: 'Projeção de LTV',
};

function classify(score: number): RevenueClassification {
  if (score >= HEALTHY_THRESHOLD) return 'healthy';
  if (score >= UNHEALTHY_THRESHOLD) return 'borderline';
  return 'unhealthy';
}

function buildReasoning(
  dimensions: RevenueQualityDimensions,
  score: number,
  classification: RevenueClassification,
): string {
  const parts: string[] = [];

  const worst = Object.entries(dimensions).reduce<{ key: string; value: number } | null>(
    (acc, [key, value]) => {
      if (acc === null || value < acc.value) return { key, value };
      return acc;
    },
    null,
  );

  const best = Object.entries(dimensions).reduce<{ key: string; value: number } | null>(
    (acc, [key, value]) => {
      if (acc === null || value > acc.value) return { key, value };
      return acc;
    },
    null,
  );

  const worstLabel = worst !== null ? (DIMENSION_LABELS[worst.key] ?? worst.key) : 'N/A';
  const bestLabel = best !== null ? (DIMENSION_LABELS[best.key] ?? best.key) : 'N/A';

  parts.push(
    `Score ${score.toFixed(2)} — classificação ${classification}. ` +
      `Destaque positivo: ${bestLabel} (${(best?.value ?? 0).toFixed(2)}). ` +
      `Principal limitador: ${worstLabel} (${(worst?.value ?? 0).toFixed(2)}).`,
  );

  return parts.join('');
}

function buildBlockerSuggestion(
  dimensions: RevenueQualityDimensions,
  input: RevenueQualityInput,
): string {
  void input;
  const suggestions: string[] = [];

  if (dimensions.refundScore < 0.4) {
    suggestions.push(
      'Risco de reembolso elevado — verificar política de devolução e qualidade do produto.',
    );
  }
  if (dimensions.supportScore < 0.4) {
    suggestions.push(
      'Custo de suporte desproporcional à receita — automatizar respostas ou revisar processo de onboarding.',
    );
  }
  if (dimensions.churnScore < 0.4) {
    suggestions.push(
      'Risco de churn alto — considerar garantia de satisfação ou acompanhamento pós-venda reforçado.',
    );
  }
  if (dimensions.brandScore < 0.4) {
    suggestions.push('Desgaste de marca detectado — avaliar limite de frequência desta oferta.');
  }
  if (dimensions.marginScore < 0.4) {
    suggestions.push(
      'Margem muito baixa — rever precificação ou estrutura de custos antes de aceitar este tipo de venda.',
    );
  }
  if (dimensions.ltvScore < 0.4) {
    suggestions.push(
      'LTV projetado insuficiente — este cliente tem baixo potencial de retorno a longo prazo.',
    );
  }

  if (suggestions.length === 0) {
    return 'Receita classificada como unhealthy — revisar política de aceitação com o dono da operação.';
  }

  return suggestions.join(' ');
}

@Injectable()
export class RevenueQualityScorerService {
  private readonly logger = new Logger(RevenueQualityScorerService.name);

  score(input: RevenueQualityInput): RevenueQualityResult {
    const { amountCents, marginPct, refundRiskScore, supportCostEstimateCents, churnRiskScore, brandWearScore, ltvProjectionCents } = input;

    const marginScore = clamp(marginPct, 0, 1);

    const refundScore = clamp(1 - clamp(refundRiskScore, 0, 1), 0, 1);

    const supportCostRatio = ratioOrZero(supportCostEstimateCents, amountCents);
    const supportScore = clamp(1 - supportCostRatio / SUPPORT_COST_CAP_RATIO, 0, 1);

    const churnScore = clamp(1 - clamp(churnRiskScore, 0, 1), 0, 1);

    const brandScore = clamp(1 - clamp(brandWearScore, 0, 1), 0, 1);

    const ltvRatio = ratioOrZero(ltvProjectionCents, amountCents);
    const ltvScore = clamp(ltvRatio / LTV_MULTIPLIER_THRESHOLD, 0, 1);

    const dimensions: RevenueQualityDimensions = {
      marginScore: Math.round(marginScore * 1000) / 1000,
      refundScore: Math.round(refundScore * 1000) / 1000,
      supportScore: Math.round(supportScore * 1000) / 1000,
      churnScore: Math.round(churnScore * 1000) / 1000,
      brandScore: Math.round(brandScore * 1000) / 1000,
      ltvScore: Math.round(ltvScore * 1000) / 1000,
    };

    const w = DEFAULT_WEIGHTS;
    const rawScore =
      marginScore * w.margin +
      refundScore * w.refundRisk +
      supportScore * w.supportCost +
      churnScore * w.churnRisk +
      brandScore * w.brandWear +
      ltvScore * w.ltvProjection;

    const qualityScore = clamp(Math.round(rawScore * 1000) / 1000, 0, 1);
    const classification = classify(qualityScore);
    const reasoning = buildReasoning(dimensions, qualityScore, classification);
    const blockerSuggestion =
      classification === 'unhealthy' ? buildBlockerSuggestion(dimensions, input) : undefined;

    this.logger.debug(
      `Revenue quality scored: ${qualityScore.toFixed(3)} — ${classification}`,
    );

    return {
      qualityScore,
      classification,
      reasoning,
      ...(blockerSuggestion !== undefined ? { blockerSuggestion } : {}),
      evaluatedAt: new Date().toISOString(),
      dimensions,
    };
  }
}
