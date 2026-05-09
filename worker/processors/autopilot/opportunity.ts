import { prisma } from '../../db';
import { redis } from '../../redis-client';
import { AIProvider } from '../../providers/ai-provider';
import { type CustomerCognitiveState } from '../cia/cognitive-state';
import {
  log,
  normalizeJsonObject,
  extractFirstJsonObject,
  scoreToProbabilityBucket,
  type UnknownRecord,
  type WorkspaceSelfIdentity,
  CIA_CONTACT_LOCK_TTL_SECONDS,
  CIA_OPPORTUNITY_LOOKBACK_DAYS,
  CIA_OPPORTUNITY_REFRESH_LIMIT,
  CIA_OPPORTUNITY_REFRESH_TTL_SECONDS,
  CIA_CONTACT_SCORE_MESSAGE_LIMIT,
  NON_DIGIT_RE,
  SEPARATOR_G_RE,
  WHITESPACE_G_RE,
  J__S_COMPREI_JA_S_COMPR_RE,
  PIX_BOLETO_CART_A__O_CA_RE,
  QUERO_VOU_COMPRAR_COMO_RE,
  QUANTO_VALOR_PRE_C__O_F_RE,
  PAGAMENTO_APROVADO_PAGA_RE,
  CURSO_PLANO_MENTORIA_PR_RE,
  OBRIGAD_VALEU_PERFEITO_RE,
  OBRIGAD_VALEU_PERFEITO_RE_2,
  PRE_C__O_VALOR_QUANTO_O_RE,
  QUERO_VOU_COMPRAR_ME_MA_RE,
  PROBLEMA_ERRO_SUPORTE_A_RE,
  PROBLEMA_RUIM_HORR_I__V_RE,
  QUERO_COMPRAR_ASSINAR_F_RE,
  PROBLEMA_ERRO_SUPORTE_A_RE_2,
  RECLAMA_CANCELAR_RE,
  CARO_SEM_DINHEIRO_AGORA_RE,
  SUMI_SEM_RESPOSTA_DEPOI_RE,
  B_SOU_HOMEM_MEU_MARIDO_RE,
  B_SOU_MULHER_MINHA_ESPO_RE,
  B__D_2___S_ANOS_B_RE,
  B___SOU_DE_MORO_EM_AQUI_RE,
} from './shared';
import {
  normalizeCatalogPhone,
  resolveWorkspaceSelfIdentity,
  buildConversationLedger,
  resolveCatalogChatActivityTimestamp,
  isWorkspaceSelfTarget,
  resolveCanonicalChatId,
  isIndividualWahaChatId,
} from './identity';

export async function acquireCiaContactLock(contactId?: string, phone?: string) {
  const keyBase = contactId || phone;
  if (!keyBase) {
    return null;
  }

  const key = `cia:lock:${keyBase}`;
  try {
    const result = await (
      redis as never as { set: (...args: unknown[]) => Promise<string | null> }
    ).set(key, '1', 'EX', CIA_CONTACT_LOCK_TTL_SECONDS, 'NX');
    return result ? key : null;
  } catch (err: unknown) {
    const errInstanceofError =
      err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    log.warn('acquireCiaContactLock redis failure', {
      key,
      error: errInstanceofError?.message || String(err),
    });
    return null;
  }
}

export async function releaseCiaContactLock(lockKey: string | null) {
  if (!lockKey) {
    return;
  }
  try {
    await redis.del(lockKey);
  } catch {
    // ignore
  }
}

export function mapOpportunityBucket(score: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (score >= 75) {
    return 'HIGH';
  }
  if (score >= 45) {
    return 'MEDIUM';
  }
  return 'LOW';
}

export function classifyOpportunityCandidate(input: {
  candidate: {
    cluster: string;
    pending: boolean;
    unreadCount: number;
    priority: number;
    silenceMinutes: number;
    suggestedAction: string;
    cognitiveState: CustomerCognitiveState;
  };
  joinedText: string;
  optedOutAt?: Date | string | null;
  customFields?: Record<string, unknown> | null;
}) {
  const text = String(input.joinedText || '').toLowerCase();
  const customFields = (input.customFields || {}) as Record<string, unknown>;
  const customerStatus = String(
    customFields.customerStatus || customFields.status || customFields.stage || '',
  ).toLowerCase();

  const purchased =
    input.optedOutAt ||
    customerStatus.includes('won') ||
    customerStatus.includes('cliente') ||
    customerStatus.includes('customer') ||
    J__S_COMPREI_JA_S_COMPR_RE.test(text);

  if (purchased) {
    return {
      opportunityClass: 'BOUGHT',
      score: 0,
      nextBestAction: 'DO_NOT_CONTACT',
      reason: 'already_converted_or_blocked',
    };
  }

  const waitingMoney =
    input.candidate.cluster === 'PAYMENT' ||
    input.candidate.cognitiveState.paymentState === 'PENDING' ||
    input.candidate.cognitiveState.paymentState === 'READY_TO_PAY' ||
    PIX_BOLETO_CART_A__O_CA_RE.test(text);

  const hotIntent =
    input.candidate.cluster === 'HOT' ||
    ['HOT', 'CHECKOUT'].includes(input.candidate.cognitiveState.stage) ||
    QUERO_VOU_COMPRAR_COMO_RE.test(text);

  const clientWaiting =
    input.candidate.pending ||
    input.candidate.unreadCount > 0 ||
    input.candidate.cognitiveState.nextBestAction === 'RESPOND';

  const askedAndGhosted =
    !clientWaiting &&
    input.candidate.silenceMinutes >= 6 * 60 &&
    QUANTO_VALOR_PRE_C__O_F_RE.test(text);

  const warm =
    !askedAndGhosted &&
    (input.candidate.priority >= 55 ||
      input.candidate.silenceMinutes < 72 * 60 ||
      input.candidate.cognitiveState.trustScore >= 0.45);

  let opportunityClass = 'COLD';
  if (waitingMoney) {
    opportunityClass = 'WAITING_MONEY';
  } else if (hotIntent) {
    opportunityClass = 'HIGH_INTENT';
  } else if (clientWaiting) {
    opportunityClass = 'ASKED_AND_GHOSTED';
  } else if (warm) {
    opportunityClass = 'WARM';
  }

  const baseScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        input.candidate.priority +
          input.candidate.cognitiveState.trustScore * 18 +
          input.candidate.cognitiveState.urgencyScore * 22 -
          Math.min(18, input.candidate.silenceMinutes / 180),
      ),
    ),
  );

  const score =
    opportunityClass === 'WAITING_MONEY'
      ? Math.max(88, baseScore)
      : opportunityClass === 'HIGH_INTENT'
        ? Math.max(78, baseScore)
        : opportunityClass === 'ASKED_AND_GHOSTED'
          ? Math.max(62, baseScore)
          : opportunityClass === 'WARM'
            ? Math.max(48, Math.min(74, baseScore))
            : Math.min(44, baseScore);

  return {
    opportunityClass,
    score,
    nextBestAction: input.candidate.suggestedAction || 'FOLLOWUP_SOFT',
    reason: `opportunity_${opportunityClass.toLowerCase()}`,
  };
}

export function buildCompressedOpportunityContext(input: {
  contactName?: string | null;
  phone?: string | null;
  candidate: {
    lastMessageText: string;
    unreadCount: number;
    silenceMinutes: number;
    cluster: string;
    suggestedAction: string;
    cognitiveState: CustomerCognitiveState;
  };
  messages: Array<{ direction: string; content?: string | null }>;
  opportunityClass: string;
  score: number;
}) {
  const lastInbound = input.messages.find((message) => message.direction === 'INBOUND');
  const lastOutbound = input.messages.find((message) => message.direction === 'OUTBOUND');

  return [
    `Contato: ${input.contactName || input.phone || 'sem_nome'}`,
    `Classe de oportunidade: ${input.opportunityClass}`,
    `Probabilidade estimada: ${input.score}%`,
    `Cluster CIA: ${input.candidate.cluster}`,
    `Próxima melhor ação: ${input.candidate.suggestedAction}`,
    `Silêncio: ${input.candidate.silenceMinutes} minuto(s)`,
    `Mensagens pendentes: ${input.candidate.unreadCount}`,
    `Resumo cognitivo: ${input.candidate.cognitiveState.summary}`,
    `Última inbound: ${String(lastInbound?.content || input.candidate.lastMessageText || '').slice(0, 280)}`,
    `Última outbound: ${String(lastOutbound?.content || '').slice(0, 280)}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export async function upsertCatalogConversationShell(input: {
  workspaceId: string;
  contactId: string;
  lastMessageAt: Date;
  unreadCount?: number;
}) {
  const existing = await prisma.conversation.findFirst({
    where: {
      workspaceId: input.workspaceId,
      contactId: input.contactId,
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      unreadCount: true,
      lastMessageAt: true,
    },
  });

  if (!existing) {
    await prisma.conversation.create({
      data: {
        workspaceId: input.workspaceId,
        contactId: input.contactId,
        status: 'OPEN',
        priority: 'MEDIUM',
        channel: 'WHATSAPP',
        mode: 'AI',
        unreadCount: Math.max(0, Number(input.unreadCount || 0) || 0),
        lastMessageAt: input.lastMessageAt,
      },
    });
    return;
  }

  const currentLastMessageAt =
    existing.lastMessageAt instanceof Date
      ? existing.lastMessageAt
      : new Date(existing.lastMessageAt);

  await prisma.conversation.updateMany({
    where: { id: existing.id, workspaceId: input.workspaceId },
    data: {
      unreadCount: Math.max(
        0,
        Number(existing.unreadCount || 0) || 0,
        Number(input.unreadCount || 0) || 0,
      ),
      lastMessageAt:
        Number.isFinite(currentLastMessageAt.getTime()) &&
        currentLastMessageAt > input.lastMessageAt
          ? currentLastMessageAt
          : input.lastMessageAt,
    },
  });
}

export async function maybeScoreContactWithAi(input: {
  contactName?: string | null;
  phone?: string | null;
  history: string;
  wonDealTitle?: string | null;
  wonDealValue?: number | null;
}): Promise<{
  leadScore: number;
  purchaseProbability: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  purchaseProbabilityScore: number;
  sentiment: string;
  intent: string;
  summary: string;
  nextBestAction: string;
  reasons: string[];
  buyerStatus: 'BOUGHT' | 'NOT_BOUGHT' | 'UNKNOWN';
  purchasedProduct: string | null;
  purchaseValue: number | null;
  purchaseReason: string | null;
  notPurchasedReason: string | null;
  preferences: string[];
  importantDetails: string[];
  purchaseProbabilityPercent: number;
  demographics: {
    gender: string;
    ageRange: string;
    location: string;
    confidence: number;
  };
} | null> {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  try {
    const ai = new AIProvider(process.env.OPENAI_API_KEY);
    const response = await ai.generateChatResponse(
      [
        {
          role: 'system',
          content: 'Você é um analista comercial. Responda apenas JSON válido.',
        },
        {
          role: 'user',
          content: [
            `Contato: ${input.contactName || input.phone || 'sem_nome'}`,
            `Negócio ganho conhecido: ${input.wonDealTitle || 'nenhum'}`,
            `Valor já registrado: ${input.wonDealValue || 0}`,
            'Analise a transcrição abaixo e retorne JSON com:',
            'buyerStatus ("BOUGHT" | "NOT_BOUGHT" | "UNKNOWN")',
            'purchasedProduct (string ou null)',
            'purchaseValue (número ou null)',
            'purchaseReason (string curta ou null)',
            'notPurchasedReason (string curta ou null)',
            'leadScore (0-100 inteiro)',
            'purchaseProbability ("LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH")',
            'purchaseProbabilityScore (0-1 número)',
            'purchaseProbabilityPercent (0-100 inteiro, inclusive para recompra de quem já comprou)',
            'sentiment ("POSITIVE" | "NEUTRAL" | "NEGATIVE")',
            'intent ("BUY" | "INFO" | "SUPPORT" | "COMPLAINT" | "COLD")',
            'summary (resumo completo e objetivo, com nome, contexto, interesse, objeções, preferências e próximos passos)',
            'nextBestAction (string curta)',
            'reasons (array de justificativas curtas)',
            'preferences (array de preferências ou interesses)',
            'importantDetails (array de fatos relevantes do lead)',
            'gender (string: masculino, feminino ou unknown)',
            'ageRange (string curta como 18-24, 25-34, 35-44 ou UNKNOWN)',
            'location (string curta ou UNKNOWN)',
            'demographicsConfidence (0-1 número)',
            '',
            'Transcrição:',
            input.history,
          ].join('\n'),
        },
      ],
      'brain',
    );

    const parsed = extractFirstJsonObject(String(response?.content || ''));
    if (!parsed) {
      return null;
    }

    const leadScore = Math.max(
      0,
      Math.min(100, Math.round(Number(parsed.leadScore || parsed.score || 0) || 0)),
    );
    const bucketCandidate = String(parsed.purchaseProbability || parsed.purchase_bucket || '')
      .trim()
      .toUpperCase();
    const purchaseProbability =
      bucketCandidate === 'VERY_HIGH' ||
      bucketCandidate === 'HIGH' ||
      bucketCandidate === 'MEDIUM' ||
      bucketCandidate === 'LOW'
        ? (bucketCandidate as 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH')
        : scoreToProbabilityBucket(leadScore);
    const probabilityScore = Math.max(
      0,
      Math.min(
        1,
        Number(
          parsed.purchaseProbabilityScore || parsed.purchase_probability_score || leadScore / 100,
        ) || 0,
      ),
    );
    const purchaseProbabilityPercent = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          Number(
            parsed.purchaseProbabilityPercent ||
              parsed.purchase_probability_percent ||
              probabilityScore * 100,
          ) || 0,
        ),
      ),
    );
    const buyerStatusCandidate = String(parsed.buyerStatus || parsed.customerStatus || '')
      .trim()
      .toUpperCase();
    const buyerStatus =
      buyerStatusCandidate === 'BOUGHT' ||
      buyerStatusCandidate === 'NOT_BOUGHT' ||
      buyerStatusCandidate === 'UNKNOWN'
        ? (buyerStatusCandidate as 'BOUGHT' | 'NOT_BOUGHT' | 'UNKNOWN')
        : 'UNKNOWN';
    const purchasedProduct =
      String(parsed.purchasedProduct || parsed.productBought || parsed.product || '').trim() ||
      null;
    const purchaseValueRaw = Number(
      parsed.purchaseValue || parsed.amountPaid || parsed.valuePaid || 0,
    );
    const purchaseValue =
      Number.isFinite(purchaseValueRaw) && purchaseValueRaw > 0
        ? Number(purchaseValueRaw.toFixed(2))
        : null;

    return {
      leadScore,
      purchaseProbability,
      purchaseProbabilityScore: probabilityScore,
      purchaseProbabilityPercent,
      sentiment:
        String(parsed.sentiment || 'NEUTRAL')
          .trim()
          .toUpperCase() || 'NEUTRAL',
      intent:
        String(parsed.intent || 'INFO')
          .trim()
          .toUpperCase() || 'INFO',
      summary: String(parsed.summary || '').trim(),
      nextBestAction:
        String(parsed.nextBestAction || parsed.next_best_action || '').trim() ||
        (buyerStatus === 'BOUGHT' ? 'CUSTOMER_SUCCESS' : 'REVIEW_MANUALLY'),
      reasons: Array.isArray(parsed.reasons)
        ? parsed.reasons.map((reason: UnknownRecord) => String(reason || '').trim()).filter(Boolean)
        : [],
      buyerStatus,
      purchasedProduct,
      purchaseValue,
      purchaseReason: String(parsed.purchaseReason || parsed.purchase_reason || '').trim() || null,
      notPurchasedReason:
        String(parsed.notPurchasedReason || parsed.not_purchased_reason || '').trim() || null,
      preferences: Array.isArray(parsed.preferences)
        ? parsed.preferences.map((item: UnknownRecord) => String(item || '').trim()).filter(Boolean)
        : [],
      importantDetails: Array.isArray(parsed.importantDetails)
        ? parsed.importantDetails
            .map((item: UnknownRecord) => String(item || '').trim())
            .filter(Boolean)
        : [],
      demographics: {
        gender:
          String(parsed.gender || parsed.demographics?.gender || 'UNKNOWN')
            .trim()
            .toUpperCase() || 'UNKNOWN',
        ageRange:
          String(parsed.ageRange || parsed.demographics?.ageRange || 'UNKNOWN')
            .trim()
            .toUpperCase() || 'UNKNOWN',
        location:
          String(parsed.location || parsed.demographics?.location || 'UNKNOWN').trim() || 'UNKNOWN',
        confidence: Math.max(
          0,
          Math.min(
            1,
            Number(parsed.demographicsConfidence || parsed.demographics?.confidence || 0) || 0,
          ),
        ),
      },
    };
  } catch (error: unknown) {
    const errorInstanceofError =
      error instanceof Error
        ? error
        : new Error(typeof error === 'string' ? error : 'unknown error');
    log.warn('catalog_ai_score_failed', { error: errorInstanceofError?.message || error });
    return null;
  }
}

export function buildHeuristicCatalogScore(input: {
  joinedText: string;
  messages: Array<{ direction: string; content: string; createdAt?: Date | string | null }>;
  unreadCount: number;
  optedOutAt?: Date | string | null;
  wonDealTitle?: string | null;
  wonDealValue?: number | null;
}) {
  const text = String(input.joinedText || '').toLowerCase();
  const demographics = inferHeuristicDemographics(text);
  const inboundMessages = input.messages.filter((message) => message.direction === 'INBOUND');
  const lastInbound = inboundMessages[inboundMessages.length - 1];
  const lastInboundAt = lastInbound?.createdAt ? new Date(lastInbound.createdAt) : null;
  const ageHours =
    lastInboundAt && Number.isFinite(lastInboundAt.getTime())
      ? (Date.now() - lastInboundAt.getTime()) / 3600000
      : null;
  const reasons: string[] = [];

  if (input.optedOutAt) {
    return {
      leadScore: 0,
      purchaseProbability: 'LOW' as const,
      purchaseProbabilityScore: 0,
      sentiment: 'NEUTRAL',
      intent: 'COLD',
      summary: 'Contato bloqueado ou já convertido. Não abordar automaticamente.',
      nextBestAction: 'DO_NOT_CONTACT',
      reasons: ['opt_out_or_converted'],
      buyerStatus: 'UNKNOWN' as const,
      purchasedProduct: null,
      purchaseValue: null,
      purchaseReason: null,
      notPurchasedReason: 'opted_out',
      preferences: [],
      importantDetails: [],
      purchaseProbabilityPercent: 0,
      demographics,
    };
  }

  const boughtByDeal =
    String(input.wonDealTitle || '').trim().length > 0 ||
    (Number(input.wonDealValue || 0) || 0) > 0;
  const boughtByConversation = PAGAMENTO_APROVADO_PAGA_RE.test(text);

  if (boughtByDeal || boughtByConversation) {
    const purchaseReason = boughtByDeal
      ? 'won_deal_recorded'
      : 'payment_or_access_confirmed_in_chat';
    const purchasedProduct =
      String(input.wonDealTitle || '').trim() ||
      (CURSO_PLANO_MENTORIA_PR_RE.exec(text)?.[0] ?? null);
    const purchaseValueRaw = Number(input.wonDealValue || 0) || 0;
    const positivePostPurchaseSignal = OBRIGAD_VALEU_PERFEITO_RE.test(text);
    const repurchaseProbabilityScore = positivePostPurchaseSignal ? 0.78 : 0.56;
    const repurchaseLeadScore = Math.round(repurchaseProbabilityScore * 100);
    return {
      leadScore: repurchaseLeadScore,
      purchaseProbability: positivePostPurchaseSignal ? ('HIGH' as const) : ('MEDIUM' as const),
      purchaseProbabilityScore: repurchaseProbabilityScore,
      sentiment: OBRIGAD_VALEU_PERFEITO_RE_2.test(text) ? 'POSITIVE' : 'NEUTRAL',
      intent: 'BUY',
      summary:
        `${String(input.wonDealTitle || 'Cliente convertido').trim() || 'Cliente convertido'} com compra identificada.`.trim(),
      nextBestAction: positivePostPurchaseSignal ? 'RETAIN_AND_UPSELL' : 'CUSTOMER_SUCCESS',
      reasons: [
        purchaseReason,
        positivePostPurchaseSignal ? 'positive_post_purchase_signal' : 'existing_customer',
      ],
      buyerStatus: 'BOUGHT' as const,
      purchasedProduct,
      purchaseValue: purchaseValueRaw > 0 ? Number(purchaseValueRaw.toFixed(2)) : null,
      purchaseReason,
      notPurchasedReason: null,
      preferences: [],
      importantDetails: purchasedProduct ? [`Produto: ${purchasedProduct}`] : [],
      purchaseProbabilityPercent: Math.round(repurchaseProbabilityScore * 100),
      demographics,
    };
  }

  let leadScore = 18;
  if (inboundMessages.length >= 2) {
    leadScore += Math.min(28, inboundMessages.length * 6);
    reasons.push('multiple_recent_inbounds');
  }
  if (input.unreadCount > 0) {
    leadScore += 12;
    reasons.push('has_unread_backlog');
  }
  if (PRE_C__O_VALOR_QUANTO_O_RE.test(text)) {
    leadScore += 16;
    reasons.push('asked_price');
  }
  if (QUERO_VOU_COMPRAR_ME_MA_RE.test(text)) {
    leadScore += 24;
    reasons.push('buying_signal');
  }
  if (PROBLEMA_ERRO_SUPORTE_A_RE.test(text)) {
    leadScore -= 12;
    reasons.push('support_or_complaint');
  }
  if (ageHours !== null && ageHours <= 72) {
    leadScore += 10;
    reasons.push('recent_activity');
  }
  if (ageHours !== null && ageHours > 24 * 7) {
    leadScore -= 10;
    reasons.push('stale_interest');
  }

  leadScore = Math.max(0, Math.min(100, Math.round(leadScore)));

  const purchaseProbability = scoreToProbabilityBucket(leadScore);
  const sentiment = PROBLEMA_RUIM_HORR_I__V_RE.test(text)
    ? 'NEGATIVE'
    : OBRIGAD_VALEU_PERFEITO_RE_2.test(text)
      ? 'POSITIVE'
      : 'NEUTRAL';
  const intent = QUERO_COMPRAR_ASSINAR_F_RE.test(text)
    ? 'BUY'
    : PROBLEMA_ERRO_SUPORTE_A_RE_2.test(text)
      ? 'SUPPORT'
      : RECLAMA_CANCELAR_RE.test(text)
        ? 'COMPLAINT'
        : inboundMessages.length > 0
          ? 'INFO'
          : 'COLD';
  const nextBestAction =
    purchaseProbability === 'VERY_HIGH' || purchaseProbability === 'HIGH'
      ? 'PRIORITIZE_MANUAL_FOLLOWUP'
      : purchaseProbability === 'MEDIUM'
        ? 'NURTURE_LATER'
        : 'MONITOR_ONLY';
  const notPurchasedReason = CARO_SEM_DINHEIRO_AGORA_RE.test(text)
    ? 'objection_or_timing'
    : SUMI_SEM_RESPOSTA_DEPOI_RE.test(text)
      ? 'follow_up_needed'
      : inboundMessages.length > 0
        ? 'still_open'
        : 'insufficient_data';

  return {
    leadScore,
    purchaseProbability,
    purchaseProbabilityScore: Number((leadScore / 100).toFixed(3)),
    sentiment,
    intent,
    summary:
      inboundMessages.length > 0
        ? `Contato com ${inboundMessages.length} mensagem(ns) inbound recente(s). Último tema: ${String(lastInbound?.content || '').slice(0, 140)}`
        : 'Contato catalogado sem histórico suficiente para alta confiança.',
    nextBestAction,
    reasons,
    buyerStatus: 'NOT_BOUGHT' as const,
    purchasedProduct: null,
    purchaseValue: null,
    purchaseReason: null,
    notPurchasedReason,
    preferences: [],
    importantDetails: [],
    purchaseProbabilityPercent: Math.round((leadScore / 100) * 100),
    demographics,
  };
}

export function inferHeuristicDemographics(text: string): {
  gender: string;
  ageRange: string;
  location: string;
  confidence: number;
} {
  const normalized = String(text || '').toLowerCase();

  let gender = 'UNKNOWN';
  if (B_SOU_HOMEM_MEU_MARIDO_RE.test(normalized)) {
    gender = 'MASCULINO';
  } else if (B_SOU_MULHER_MINHA_ESPO_RE.test(normalized)) {
    gender = 'FEMININO';
  }

  const explicitAge = normalized.match(B__D_2___S_ANOS_B_RE);
  let ageRange = 'UNKNOWN';
  if (explicitAge) {
    const age = Number(explicitAge[1]);
    if (age >= 18 && age <= 24) {
      ageRange = '18-24';
    } else if (age <= 34) {
      ageRange = '25-34';
    } else if (age <= 44) {
      ageRange = '35-44';
    } else if (age <= 54) {
      ageRange = '45-54';
    } else if (age > 54) {
      ageRange = '55+';
    }
  }

  const locationMatch = normalized.match(B___SOU_DE_MORO_EM_AQUI_RE) || null;
  const location = locationMatch?.[1] ? String(locationMatch[1]).trim() : 'UNKNOWN';

  let confidence = 0;
  if (gender !== 'UNKNOWN') {
    confidence = Math.max(confidence, 0.35);
  }
  if (ageRange !== 'UNKNOWN') {
    confidence = Math.max(confidence, 0.55);
  }
  if (location !== 'UNKNOWN') {
    confidence = Math.max(confidence, 0.45);
  }

  return {
    gender,
    ageRange,
    location,
    confidence,
  };
}
