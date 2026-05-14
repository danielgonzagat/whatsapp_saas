import { Injectable } from '@nestjs/common';
import type { Disclosure, RelationshipType } from './types';
import { makeIncidentId } from './types';

/**
 * INCENT-005 — DisclosureEngine.
 *
 * Auto-divulga vínculos Kloel↔partido em recomendações cruzadas.
 * Quando há relação de propriedade, comissão, afiliação, marketplace,
 * referral, patrocínio ou parceria, emite disclosure transparente.
 *
 * Gate: `disclosure-engine` — Camada XXXIV — log_only @ Onda 9.
 */
@Injectable()
export class DisclosureEngineService {
  private static readonly DISCLOSURE_PREFIX = 'Transparência Kloel:';

  private readonly relationshipDescriptions: Record<RelationshipType, string> = {
    ownership: 'A Kloel possui participação societária nesta empresa.',
    commission: 'A Kloel pode receber comissão por esta recomendação.',
    affiliate: 'A Kloel possui vínculo de afiliação com esta empresa.',
    marketplace: 'Esta recomendação envolve o marketplace da Kloel.',
    referral: 'Esta recomendação foi originada por programa de referral.',
    sponsorship: 'Esta recomendação foi patrocinada.',
    partnership: 'A Kloel mantém parceria comercial com esta empresa.',
  };

  private seq = 0;

  public disclose(input: DisclosureInput): Disclosure {
    this.seq += 1;
    const description = input.customDescription ??
      this.relationshipDescriptions[input.relationshipType];

    const disclosureText = [
      DisclosureEngineService.DISCLOSURE_PREFIX,
      `Relação: ${input.relationshipType}`,
      description,
      input.compensationModel
        ? `Modelo de compensação: ${input.compensationModel}`
        : '',
      input.financialNature
        ? 'Esta recomendação pode ter natureza financeira para a Kloel.'
        : '',
    ]
      .filter(Boolean)
      .join(' ');

    return {
      id: makeIncidentId('dscl', this.seq),
      workspaceId: input.workspaceId,
      recommendationId: input.recommendationId,
      disclosingEntity: input.entityName ?? 'Kloel',
      relationshipType: input.relationshipType,
      relationshipDescription: description,
      financialNature: input.financialNature ?? this.isFinancial(input.relationshipType),
      ...(input.compensationModel ? { compensationModel: input.compensationModel } : {}),
      disclosedAt: new Date().toISOString(),
      disclosureText,
    } as Disclosure;
  }

  public discloseBatch(
    inputs: readonly DisclosureInput[],
  ): readonly Disclosure[] {
    return inputs.map((inp) => this.disclose(inp));
  }

  public disclosuresForRecommendation(
    disclosures: readonly Disclosure[],
    recommendationId: string,
  ): readonly Disclosure[] {
    return disclosures.filter(
      (d) => d.recommendationId === recommendationId,
    );
  }

  public undisclosedRelationships(
    disclosures: readonly Disclosure[],
    recommendationIds: readonly string[],
  ): readonly string[] {
    const disclosed = new Set(disclosures.map((d) => d.recommendationId));
    return recommendationIds.filter((id) => !disclosed.has(id));
  }

  public disclosureRate(
    recommendations: readonly string[],
    disclosures: readonly Disclosure[],
  ): number {
    if (recommendations.length === 0) return 1;
    const disclosed = new Set(disclosures.map((d) => d.recommendationId));
    let count = 0;
    for (const rec of recommendations) {
      if (disclosed.has(rec)) count += 1;
    }
    return count / recommendations.length;
  }

  private isFinancial(type: RelationshipType): boolean {
    return type === 'commission' ||
      type === 'affiliate' ||
      type === 'ownership' ||
      type === 'sponsorship';
  }
}

export interface DisclosureInput {
  readonly workspaceId: string;
  readonly recommendationId: string;
  readonly relationshipType: RelationshipType;
  readonly entityName?: string;
  readonly customDescription?: string;
  readonly financialNature?: boolean;
  readonly compensationModel?: string;
}
