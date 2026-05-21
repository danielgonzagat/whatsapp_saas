/**
 * UTP-DELEG-003 — Autonomy Suggestion Builder.
 *
 * Builds structured autonomy expansion proposals with evidence event
 * references, business impact assessment, and risk analysis.
 *
 * Pure function — stateless suggestion construction.
 */

import { randomUUID } from 'node:crypto';
import type { AutonomySuggestion, DelegationLevel, GraduationVerdict } from './delegation.types';
import { DELEGATION_LEVEL_ORDER } from './delegation.types';

interface SuggestionInput {
  readonly verdict: GraduationVerdict;
  readonly currentLevel: DelegationLevel;
  readonly evidenceEventIds: readonly string[];
  readonly nowMs: number;
}

const BUSINESS_IMPACT_TEMPLATES: Record<DelegationLevel, string> = {
  manual: 'Todas as operações exigem aprovação humana — sem impacto autônomo.',
  supervised:
    'Supervisão humana reduzida com validação por amostragem — ganho de velocidade operacional.',
  semi_autonomous:
    'Operações de baixo risco autônomas com rollback — redução de latência e aumento de cobertura.',
  autonomous:
    'Operação autônoma completa com supervisão por exceção — escala máxima de cobertura comercial.',
};

const RISK_TEMPLATES: Record<DelegationLevel, string> = {
  manual: 'Risco nulo de ação autônoma — todo movimento é humano.',
  supervised: 'Risco residual baixo — erros são capturados por validação humana por amostragem.',
  semi_autonomous: 'Risco moderado — operações com rollback automático em caso de falha.',
  autonomous: 'Risco elevado — requer monitoramento contínuo e política de rollback ativa.',
};

function buildBusinessImpact(
  currentLevel: DelegationLevel,
  proposedLevel: DelegationLevel,
): string {
  const currentOrder = DELEGATION_LEVEL_ORDER[currentLevel];
  const proposedOrder = DELEGATION_LEVEL_ORDER[proposedLevel];

  if (proposedOrder <= currentOrder) {
    return 'Nível de autonomia mantido ou reduzido — sem ganho incremental de cobertura.';
  }

  const impact = BUSINESS_IMPACT_TEMPLATES[proposedLevel];
  const delta = proposedOrder - currentOrder;
  const stepLabel = delta === 1 ? 'um nível' : `${delta} níveis`;

  return `${impact} (escalada de ${stepLabel} a partir de ${currentLevel}).`;
}

function buildRiskAssessment(proposedLevel: DelegationLevel, confidence: number): string {
  const risk = RISK_TEMPLATES[proposedLevel] ?? RISK_TEMPLATES['manual'];
  const confPct = Math.round(confidence * 100);

  return `${risk} Confiança atual: ${confPct}%.`;
}

/**
 * Build an autonomy suggestion from a graduation verdict.
 */
export function buildAutonomySuggestion(input: SuggestionInput): AutonomySuggestion {
  const { verdict, currentLevel, evidenceEventIds, nowMs } = input;

  const proposedLevel = verdict.verdict === 'promote' ? verdict.suggestedLevel : currentLevel;

  return {
    suggestionId: `sug_${randomUUID()}`,
    area: verdict.area,
    workspaceId: verdict.workspaceId,
    currentLevel,
    proposedLevel,
    evidenceEventIds,
    confidence: verdict.confidence,
    businessImpact: buildBusinessImpact(currentLevel, proposedLevel),
    riskAssessment: buildRiskAssessment(proposedLevel, verdict.confidence),
    generatedAt: new Date(nowMs).toISOString(),
  };
}
