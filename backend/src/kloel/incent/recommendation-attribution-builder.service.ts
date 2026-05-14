import { Injectable } from '@nestjs/common';
import type { AttributionEntry, AttributionKind, RecommendationAttribution } from './types';
import { clamp, makeIncidentId } from './types';

/**
 * INCENT-008 — RecommendationAttributionBuilder.
 *
 * Constrói atribuição de fonte para cada recomendação.
 * Toda recomendação declara de onde veio: dados da plataforma,
 * histórico do usuário, comportamento de pares, tendência de mercado,
 * regra de negócio, conhecimento especialista ou dados de terceiro.
 *
 * Atribuições cruzadas são marcadas e pontuadas por transparência.
 */
@Injectable()
export class RecommendationAttributionBuilderService {
  private readonly kindLabels: Record<AttributionKind, string> = {
    platform_data: 'Dados da plataforma',
    user_history: 'Histórico do usuário',
    peer_behavior: 'Comportamento de pares similares',
    market_trend: 'Tendência de mercado',
    business_rule: 'Regra de negócio',
    expert_knowledge: 'Conhecimento especialista',
    third_party_data: 'Dados de terceiros',
  };

  private seq = 0;

  public build(input: AttributionInput): RecommendationAttribution {
    this.seq += 1;
    const attributions = this.buildEntries(input);

    return {
      id: makeIncidentId('attr', this.seq),
      workspaceId: input.workspaceId,
      recommendationId: input.recommendationId,
      attributions,
      isCrossRecommendation: attributions.length >= 2,
      crossSourceCount: attributions.length,
      primarySource: this.primaryKind(attributions),
      transparencyScore: this.computeTransparency(attributions),
      builtAt: new Date().toISOString(),
    };
  }

  public buildBatch(
    inputs: readonly AttributionInput[],
  ): readonly RecommendationAttribution[] {
    return inputs.map((inp) => this.build(inp));
  }

  public crossRecommendations(
    attributions: readonly RecommendationAttribution[],
  ): readonly RecommendationAttribution[] {
    return attributions.filter((a) => a.isCrossRecommendation);
  }

  public transparencyReport(
    attributions: readonly RecommendationAttribution[],
  ): AttributionReport {
    if (attributions.length === 0) {
      return {
        averageTransparency: 1,
        opaqueCount: 0,
        crossSourceRate: 0,
        dominantSources: [],
      };
    }

    const avg = attributions.reduce((s, a) => s + a.transparencyScore, 0) /
      attributions.length;
    const opaque = attributions.filter((a) => a.transparencyScore < 0.4).length;
    const crossRate = attributions.filter((a) => a.isCrossRecommendation).length /
      attributions.length;

    const sourceFreq = new Map<AttributionKind, number>();
    for (const a of attributions) {
      sourceFreq.set(a.primarySource, (sourceFreq.get(a.primarySource) ?? 0) + 1);
    }
    const dominantSources = [...sourceFreq.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([kind]) => kind);

    return {
      averageTransparency: Number(avg.toFixed(4)),
      opaqueCount: opaque,
      crossSourceRate: Number(crossRate.toFixed(4)),
      dominantSources,
    };
  }

  private buildEntries(
    input: AttributionInput,
  ): readonly AttributionEntry[] {
    const entries: AttributionEntry[] = [];

    for (const source of input.sources ?? []) {
      entries.push({
        kind: source.kind,
        label: this.kindLabels[source.kind] ?? source.kind,
        evidenceRef: source.evidenceRef,
        weight: source.weight,
      });
    }

    return entries;
  }

  private primaryKind(
    entries: readonly AttributionEntry[],
  ): AttributionKind {
    if (entries.length === 0) return 'business_rule';
    let best = entries[0]!;
    for (const e of entries) {
      if (e.weight > best.weight) best = e;
    }
    return best.kind;
  }

  private computeTransparency(
    entries: readonly AttributionEntry[],
  ): number {
    if (entries.length === 0) return 0;
    const baseScore = entries.length >= 2 ? 0.7 : 0.4;

    const weightSum = entries.reduce((s, e) => s + e.weight, 0);
    const normalizedPenalty = weightSum > 1 ? (weightSum - 1) * 0.5 : 0;

    const opaqueKinds: AttributionKind[] = ['business_rule', 'platform_data'];
    const opaqueCount = entries.filter((e) => opaqueKinds.includes(e.kind)).length;
    const opaquePenalty = entries.length > 0
      ? (opaqueCount / entries.length) * 0.3
      : 0;

    return clamp(baseScore - normalizedPenalty - opaquePenalty, 0, 1);
  }
}

interface AttributionReport {
  readonly averageTransparency: number;
  readonly opaqueCount: number;
  readonly crossSourceRate: number;
  readonly dominantSources: readonly AttributionKind[];
}

export interface AttributionInput {
  readonly workspaceId: string;
  readonly recommendationId: string;
  readonly sources?: readonly AttributionSourceEntry[];
}

export interface AttributionSourceEntry {
  readonly kind: AttributionKind;
  readonly evidenceRef: string;
  readonly weight: number;
}
