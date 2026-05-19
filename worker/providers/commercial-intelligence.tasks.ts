import { randomUUID } from 'node:crypto';
import type {
  BusinessStateSnapshot,
  CommercialDecisionEnvelope,
  DemandState,
  HumanTaskPayload,
  MarketSignal,
} from './commercial-intelligence.types';

function resolveHumanTaskUrgency(
  decision: CommercialDecisionEnvelope,
  hasCritical: boolean,
): HumanTaskPayload['urgency'] {
  if (hasCritical) {
    return 'CRITICAL';
  }
  return decision.confidence < 0.45 ? 'HIGH' : 'MEDIUM';
}

function resolveHumanTaskReason(decision: CommercialDecisionEnvelope): string {
  if (decision.riskFlags.length > 0) {
    return `A IA detectou risco operacional: ${decision.riskFlags.join(', ')}`;
  }
  return 'Confiança baixa para agir com autonomia total.';
}

function resolveHumanTaskBusinessImpact(decision: CommercialDecisionEnvelope): string {
  return decision.intent === 'BUYING'
    ? 'Venda potencial em risco'
    : 'Contato sensível requer validação humana';
}

function resolveHumanTaskSuggestedReply(decision: CommercialDecisionEnvelope): string | undefined {
  return decision.tone === 'explain'
    ? 'Posso revisar esse caso e te responder com segurança em instantes.'
    : undefined;
}

/** Build human task. */
export function buildHumanTask(input: {
  workspaceId: string;
  contactId?: string;
  phone?: string;
  decision: CommercialDecisionEnvelope;
  messageContent?: string;
}): HumanTaskPayload | null {
  const decision = input.decision;
  if (!decision.shouldEscalate && decision.riskFlags.length === 0) {
    return null;
  }

  const hasCritical = decision.riskFlags.some((flag) =>
    ['LEGAL_RISK', 'MEDICAL_RISK'].includes(flag),
  );

  return {
    id: randomUUID(),
    taskType: hasCritical ? 'HANDLE_RISK' : 'APPROVE_SPECIAL_CASE',
    urgency: resolveHumanTaskUrgency(decision, hasCritical),
    reason: resolveHumanTaskReason(decision),
    suggestedReply: resolveHumanTaskSuggestedReply(decision),
    businessImpact: resolveHumanTaskBusinessImpact(decision),
    contactId: input.contactId,
    phone: input.phone,
    createdAt: new Date().toISOString(),
  };
}

/** Build business state snapshot. */
export function buildBusinessStateSnapshot(input: {
  openBacklog: number;
  hotLeadCount: number;
  pendingPaymentCount: number;
  approvedSalesCount: number;
  approvedSalesAmount: number;
  avgResponseMinutes?: number;
  marketSignals?: MarketSignal[];
}): BusinessStateSnapshot {
  const signals = input.marketSignals || [];
  const dominantObjection =
    signals.find((signal) => signal.signalType === 'PRICE_RESISTANCE')?.normalizedKey ||
    signals[0]?.normalizedKey ||
    null;
  const topProductKey =
    signals.find((signal) => signal.signalType === 'PRODUCT_DEMAND')?.normalizedKey || null;

  let growthRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
  if (input.openBacklog > 150 || input.pendingPaymentCount > 30) {
    growthRiskLevel = 'HIGH';
  } else if (input.openBacklog > 50 || input.pendingPaymentCount > 10) {
    growthRiskLevel = 'MEDIUM';
  }

  return {
    openBacklog: input.openBacklog,
    hotLeadCount: input.hotLeadCount,
    pendingPaymentCount: input.pendingPaymentCount,
    approvedSalesCount: input.approvedSalesCount,
    approvedSalesAmount: Number((input.approvedSalesAmount || 0).toFixed(2)),
    avgResponseMinutes: Number((input.avgResponseMinutes || 0).toFixed(2)),
    dominantObjection,
    topProductKey,
    growthRiskLevel,
    attentionBudget: {
      hot: 40,
      pendingPayments: 20,
      support: 15,
      nurture: 15,
      cold: 10,
    },
    generatedAt: new Date().toISOString(),
  };
}

/** Build mission plan. */
export function buildMissionPlan(input: {
  workspaceName?: string | null;
  demandStates: Array<{ contactName?: string | null; demandState: DemandState }>;
  marketSignals: MarketSignal[];
  snapshot: BusinessStateSnapshot;
}) {
  const topPriority = input.demandStates
    .sort((a, b) => b.demandState.attentionScore - a.demandState.attentionScore)
    .slice(0, 3)
    .map((item) => item.contactName || 'contato');

  const priorities = [
    input.snapshot.pendingPaymentCount > 0
      ? `recuperar ${input.snapshot.pendingPaymentCount} pagamentos pendentes`
      : null,
    input.snapshot.hotLeadCount > 0
      ? `priorizar ${input.snapshot.hotLeadCount} leads quentes`
      : null,
    input.marketSignals[0]
      ? `agir sobre o sinal dominante ${input.marketSignals[0].normalizedKey}`
      : null,
  ].filter(Boolean) as string[];

  return {
    summary:
      priorities.length > 0
        ? `Vou ${priorities.join(', ')}.`
        : 'Vou manter o WhatsApp sob monitoramento e responder o que gerar mais retorno.',
    focusContacts: topPriority,
    priorities,
  };
}
