import { randomUUID } from 'node:crypto';
import type { PrismaClient, Prisma } from '@prisma/client';

/**
 * Subset of PrismaClient used by commercial-intelligence persistence functions.
 * Accepts either a full PrismaClient or a partial stub with the required delegates.
 */
type PrismaLike = Pick<PrismaClient, 'kloelMemory' | 'systemInsight'>;

export type DemandLane = 'HOT' | 'WARM' | 'COLD' | 'SLEEP' | 'DEAD';
export type DemandStrategy = 'PUSH' | 'EDUCATE' | 'NURTURE' | 'WAIT' | 'DROP' | 'RECOVER_PAYMENT';
export type ResponseTone = 'short' | 'normal' | 'persuasive' | 'aggressive' | 'explain';
export type RuntimeMode = 'ASSIST' | 'AUTONOMOUS';
export type NextAction = 'WAIT' | 'FOLLOWUP' | 'CREATE_LINK' | 'ESCALATE';

export interface DemandState {
  heatScore: number;
  fatigueScore: number;
  conversionOdds: number;
  abandonmentRisk: number;
  lane: DemandLane;
  strategy: DemandStrategy;
  attentionScore: number;
  reactivationAt?: string;
}

export interface CommercialDecisionEnvelope {
  intent: string;
  strategy: string;
  tone: ResponseTone;
  reply?: string;
  nextAction: NextAction;
  confidence: number;
  riskFlags: string[];
  shouldEscalate: boolean;
  capabilities: {
    canAskQuestions: boolean;
    canBeShort: boolean;
    canBeAggressive: boolean;
    canExperiment: boolean;
    canFollowUp: boolean;
    canRetry: boolean;
  };
}

export interface MarketSignal {
  signalType: string;
  normalizedKey: string;
  frequency: number;
  examples: string[];
}

export interface HumanTaskPayload {
  id: string;
  taskType: string;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reason: string;
  suggestedReply?: string;
  businessImpact?: string;
  contactId?: string;
  phone?: string;
  conversationId?: string | null;
  status?: 'OPEN' | 'APPROVED' | 'REJECTED' | 'RESOLVED';
  resolvedAt?: string;
  approvedReply?: string | null;
  createdAt: string;
}

export interface BusinessStateSnapshot {
  openBacklog: number;
  hotLeadCount: number;
  pendingPaymentCount: number;
  approvedSalesCount: number;
  approvedSalesAmount: number;
  avgResponseMinutes: number;
  dominantObjection: string | null;
  topProductKey: string | null;
  growthRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  attentionBudget: {
    hot: number;
    pendingPayments: number;
    support: number;
    nurture: number;
    cold: number;
  };
  generatedAt: string;
}

const BUYING_KEYWORDS = [
  'preco',
  'preço',
  'valor',
  'quanto',
  'pix',
  'boleto',
  'cartao',
  'cartão',
  'assin',
  'comprar',
  'fechar',
];
const PAYMENT_KEYWORDS = [
  'pix',
  'boleto',
  'cartao',
  'cartão',
  'pagamento',
  'pagar',
  'vencimento',
  'cobran',
];
const NEGATIVE_KEYWORDS = [
  'processo',
  'advogado',
  'procon',
  'anvisa',
  'médico',
  'medico',
  'reembolso',
  'devolver',
  'estorno',
  'reclama',
  'raiva',
];
const PRODUCT_TERMS = [
  'produto',
  'comprar',
  'preço',
  'preco',
  'valor',
  'kit',
  'combo',
  'plano',
  'assinatura',
];

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function normalized(text?: string) {
  return String(text || '').toLowerCase();
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

export function computeDemandState(input: {
  lastMessageAt?: Date | string | null;
  unreadCount?: number;
  leadScore?: number | null;
  lastMessageText?: string | null;
  followupAttempts?: number;
  ignoredCount?: number;
}): DemandState {
  const text = normalized(input.lastMessageText);
  const unreadCount = Math.max(0, Number(input.unreadCount || 0) || 0);
  const leadScore = clamp((Number(input.leadScore || 0) || 0) / 100);
  const followupAttempts = Math.max(0, Number(input.followupAttempts || 0) || 0);
  const ignoredCount = Math.max(0, Number(input.ignoredCount || 0) || 0);
  const lastMessageAt = input.lastMessageAt ? new Date(input.lastMessageAt) : null;
  const recencyHours = lastMessageAt
    ? Math.max(0, (Date.now() - lastMessageAt.getTime()) / 3_600_000)
    : 999;

  const recencyScore =
    recencyHours <= 1
      ? 1
      : recencyHours <= 6
        ? 0.85
        : recencyHours <= 24
          ? 0.65
          : recencyHours <= 72
            ? 0.4
            : 0.15;
  const unreadScore = clamp(unreadCount / 5);
  const buyingSignal = includesAny(text, BUYING_KEYWORDS) ? 1 : 0;
  const paymentSignal = includesAny(text, PAYMENT_KEYWORDS) ? 1 : 0;
  const negativeSignal = includesAny(text, NEGATIVE_KEYWORDS) ? 1 : 0;

  const fatigueScore = clamp(followupAttempts * 0.18 + ignoredCount * 0.22 + negativeSignal * 0.45);
  const heatScore = clamp(
    recencyScore * 0.3 +
      unreadScore * 0.2 +
      leadScore * 0.2 +
      buyingSignal * 0.2 +
      paymentSignal * 0.18 -
      fatigueScore * 0.18,
  );
  const conversionOdds = clamp(
    heatScore * 0.55 + buyingSignal * 0.2 + paymentSignal * 0.2 - fatigueScore * 0.25,
  );
  const abandonmentRisk = clamp(
    (recencyHours > 48 ? 0.35 : 0.1) +
      fatigueScore * 0.35 +
      (ignoredCount >= 3 ? 0.2 : 0) +
      (negativeSignal ? 0.2 : 0),
  );

  let lane: DemandLane = 'COLD';
  if (heatScore >= 0.8 || paymentSignal) {
    lane = 'HOT';
  } else if (heatScore >= 0.6) {
    lane = 'WARM';
  } else if (heatScore >= 0.35) {
    lane = 'COLD';
  } else if (recencyHours <= 168) {
    lane = 'SLEEP';
  } else {
    lane = 'DEAD';
  }

  let strategy: DemandStrategy = 'NURTURE';
  if (paymentSignal) {
    strategy = 'RECOVER_PAYMENT';
  } else if (lane === 'HOT') {
    strategy = 'PUSH';
  } else if (lane === 'WARM') {
    strategy = 'EDUCATE';
  } else if (lane === 'COLD') {
    strategy = 'NURTURE';
  } else if (lane === 'SLEEP') {
    strategy = 'WAIT';
  } else {
    strategy = 'DROP';
  }

  const attentionScore = clamp(
    heatScore * 0.45 +
      conversionOdds * 0.35 +
      (paymentSignal ? 0.25 : 0) -
      fatigueScore * 0.2 -
      abandonmentRisk * 0.1,
    0,
    1.5,
  );

  const reactivationAt =
    strategy === 'WAIT' ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : undefined;

  return {
    heatScore: Number(heatScore.toFixed(3)),
    fatigueScore: Number(fatigueScore.toFixed(3)),
    conversionOdds: Number(conversionOdds.toFixed(3)),
    abandonmentRisk: Number(abandonmentRisk.toFixed(3)),
    lane,
    strategy,
    attentionScore: Number(attentionScore.toFixed(3)),
    reactivationAt,
  };
}

export function buildDecisionEnvelope(input: {
  intent: string;
  action: string;
  confidence?: number;
  messageContent?: string | null;
  demandState?: DemandState | null;
  matchedProducts?: string[];
}): CommercialDecisionEnvelope {
  const text = normalized(input.messageContent);
  const demandState = input.demandState || null;
  const confidence = clamp(Number(input.confidence || 0));
  const riskFlags = new Set<string>();

  if (includesAny(text, NEGATIVE_KEYWORDS)) {
    if (text.includes('processo') || text.includes('advogado') || text.includes('procon')) {
      riskFlags.add('LEGAL_RISK');
    }
    if (text.includes('médico') || text.includes('medico') || text.includes('anvisa')) {
      riskFlags.add('MEDICAL_RISK');
    }
    if (text.includes('reembolso') || text.includes('estorno')) {
      riskFlags.add('REFUND_RISK');
    }
  }

  if (
    includesAny(text, ['desconto', '%', 'abaixar', 'melhorar o preco', 'melhorar o preço']) &&
    confidence < 0.9
  ) {
    riskFlags.add('DISCOUNT_APPROVAL_REQUIRED');
  }

  if (
    input.action === 'SEND_PRICE' &&
    (!input.matchedProducts || input.matchedProducts.length === 0)
  ) {
    riskFlags.add('PRICE_UNCERTAIN');
  }

  const tone: ResponseTone =
    riskFlags.size > 0
      ? 'explain'
      : demandState?.strategy === 'PUSH'
        ? 'persuasive'
        : demandState?.strategy === 'RECOVER_PAYMENT'
          ? 'short'
          : demandState?.lane === 'HOT'
            ? 'short'
            : demandState?.lane === 'WARM'
              ? 'normal'
              : 'explain';

  const nextAction: NextAction =
    riskFlags.size > 0
      ? 'ESCALATE'
      : input.action === 'SEND_PRICE' || input.action === 'SEND_OFFER'
        ? 'FOLLOWUP'
        : input.intent === 'BUYING'
          ? 'CREATE_LINK'
          : 'WAIT';

  return {
    intent: input.intent || 'GENERAL',
    strategy: demandState?.strategy || 'NURTURE',
    tone,
    nextAction,
    confidence,
    riskFlags: [...riskFlags],
    shouldEscalate:
      riskFlags.size > 0 ||
      (confidence < 0.55 &&
        !['GENERAL_ASSISTANCE', 'IDLE', 'GREET'].includes(input.intent || 'GENERAL')),
    capabilities: {
      canAskQuestions: true,
      canBeShort: true,
      canBeAggressive: demandState?.lane === 'HOT' || demandState?.strategy === 'PUSH',
      canExperiment: demandState?.lane !== 'DEAD',
      canFollowUp: demandState?.strategy !== 'DROP',
      canRetry: !riskFlags.has('LEGAL_RISK') && !riskFlags.has('MEDICAL_RISK'),
    },
  };
}

export function shouldAutonomousSend(decision: CommercialDecisionEnvelope, mode: RuntimeMode) {
  const hardRisk = decision.riskFlags.some((flag) =>
    ['LEGAL_RISK', 'MEDICAL_RISK', 'PRICE_UNCERTAIN'].includes(flag),
  );

  if (hardRisk) return false;
  if (decision.shouldEscalate && mode === 'ASSIST') return false;
  if (decision.confidence >= 0.85) return true;
  if (mode === 'AUTONOMOUS' && decision.confidence >= 0.7) return true;
  return false;
}

export function extractMarketSignals(messages: Array<string | null | undefined>) {
  const signalMap = new Map<string, MarketSignal>();

  const registerSignal = (signalType: string, normalizedKey: string, text: string) => {
    const current = signalMap.get(normalizedKey) || {
      signalType,
      normalizedKey,
      frequency: 0,
      examples: [],
    };
    current.frequency += 1;
    if (text && current.examples.length < 3 && !current.examples.includes(text)) {
      current.examples.push(text);
    }
    signalMap.set(normalizedKey, current);
  };

  for (const rawMessage of messages) {
    const text = normalized(rawMessage);
    if (!text) continue;

    if (includesAny(text, ['rastreio', 'codigo', 'código', 'entrega'])) {
      registerSignal('TRACKING', 'tracking_confidence', text);
    }
    if (includesAny(text, ['preco', 'preço', 'valor', 'caro', 'desconto', 'quanto', 'custa'])) {
      registerSignal('PRICE_RESISTANCE', 'price_resistance', text);
    }
    if (includesAny(text, ['parcel', 'boleto', 'pix', 'cartao', 'cartão'])) {
      registerSignal('PAYMENT_FLEXIBILITY', 'payment_flexibility', text);
    }
    if (includesAny(text, ['kit', 'combo', '3 unidades', '5 unidades'])) {
      registerSignal('BUNDLE_DEMAND', 'bundle_demand', text);
    }
    for (const product of PRODUCT_TERMS) {
      if (text.includes(product)) {
        registerSignal('PRODUCT_DEMAND', `product:${product}`, text);
      }
    }
  }

  return [...signalMap.values()].sort((a, b) => b.frequency - a.frequency);
}

export function buildHumanTask(input: {
  workspaceId: string;
  contactId?: string;
  phone?: string;
  decision: CommercialDecisionEnvelope;
  messageContent?: string;
}): HumanTaskPayload | null {
  const decision = input.decision;
  if (!decision.shouldEscalate && decision.riskFlags.length === 0) return null;

  const hasCritical = decision.riskFlags.some((flag) =>
    ['LEGAL_RISK', 'MEDICAL_RISK'].includes(flag),
  );
  const urgency = hasCritical ? 'CRITICAL' : decision.confidence < 0.45 ? 'HIGH' : 'MEDIUM';

  return {
    id: randomUUID(),
    taskType: hasCritical ? 'HANDLE_RISK' : 'APPROVE_SPECIAL_CASE',
    urgency,
    reason:
      decision.riskFlags.length > 0
        ? `A IA detectou risco operacional: ${decision.riskFlags.join(', ')}`
        : 'Confiança baixa para agir com autonomia total.',
    suggestedReply:
      decision.tone === 'explain'
        ? 'Posso revisar esse caso e te responder com segurança em instantes.'
        : undefined,
    businessImpact:
      decision.intent === 'BUYING'
        ? 'Venda potencial em risco'
        : 'Contato sensível requer validação humana',
    contactId: input.contactId,
    phone: input.phone,
    createdAt: new Date().toISOString(),
  };
}

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

/** Coerce a domain object into a Prisma-compatible JSON input value. */
function toJsonValue<T>(obj: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(obj)) as Prisma.InputJsonValue;
}

async function upsertMemory(
  prisma: Partial<PrismaLike>,
  input: {
    workspaceId: string;
    key: string;
    value: DemandState | MarketSignal | BusinessStateSnapshot | HumanTaskPayload;
    category: string;
    type: string;
    content?: string;
    metadata?: Record<string, unknown>;
  },
) {
  if (!prisma?.kloelMemory?.upsert) return null;

  const jsonValue = toJsonValue(input.value);
  const jsonMetadata = input.metadata ? toJsonValue(input.metadata) : undefined;

  return prisma.kloelMemory.upsert({
    where: {
      workspaceId_key: {
        workspaceId: input.workspaceId,
        key: input.key,
      },
    },
    update: {
      value: jsonValue,
      category: input.category,
      type: input.type,
      content: input.content,
      metadata: jsonMetadata,
    },
    create: {
      workspaceId: input.workspaceId,
      key: input.key,
      value: jsonValue,
      category: input.category,
      type: input.type,
      content: input.content,
      metadata: jsonMetadata,
    },
  });
}

export async function persistDemandState(
  prisma: Partial<PrismaLike>,
  input: {
    workspaceId: string;
    contactId: string;
    state: DemandState;
    contactName?: string | null;
  },
) {
  return upsertMemory(prisma, {
    workspaceId: input.workspaceId,
    key: `demand_state:${input.contactId}`,
    value: input.state,
    category: 'demand_control',
    type: 'demand_state',
    content: input.state.strategy,
    metadata: {
      contactId: input.contactId,
      contactName: input.contactName || null,
    },
  });
}

export async function persistMarketSignals(
  prisma: Partial<PrismaLike>,
  input: {
    workspaceId: string;
    signals: MarketSignal[];
  },
) {
  // biome-ignore lint/performance/noAwaitInLoops: sequential signal processing
  for (const signal of input.signals.slice(0, 10)) {
    await upsertMemory(prisma, {
      workspaceId: input.workspaceId,
      key: `market_signal:${signal.normalizedKey}`,
      value: signal,
      category: 'market_signal',
      type: signal.signalType,
      content: signal.normalizedKey,
      metadata: {
        frequency: signal.frequency,
        examples: signal.examples,
      },
    });
  }
}

export async function persistBusinessSnapshot(
  prisma: Partial<PrismaLike>,
  input: {
    workspaceId: string;
    snapshot: BusinessStateSnapshot;
  },
) {
  await upsertMemory(prisma, {
    workspaceId: input.workspaceId,
    key: 'business_state:current',
    value: input.snapshot,
    category: 'business_state',
    type: 'snapshot',
    content: input.snapshot.growthRiskLevel,
    metadata: {
      dominantObjection: input.snapshot.dominantObjection,
      topProductKey: input.snapshot.topProductKey,
    },
  });
}

export async function persistHumanTask(
  prisma: Partial<PrismaLike>,
  input: {
    workspaceId: string;
    task: HumanTaskPayload;
  },
) {
  if (!prisma?.kloelMemory?.create) return null;

  return prisma.kloelMemory.create({
    data: {
      workspaceId: input.workspaceId,
      key: `human_task:${input.task.contactId || input.task.phone || input.task.id}:${input.task.id}`,
      value: toJsonValue(input.task),
      category: 'human_task',
      type: input.task.taskType,
      content: input.task.reason,
      metadata: toJsonValue({
        urgency: input.task.urgency,
        businessImpact: input.task.businessImpact,
        contactId: input.task.contactId,
        phone: input.task.phone,
      }),
    },
  });
}

export async function persistSystemInsight(
  prisma: Partial<PrismaLike>,
  input: {
    workspaceId: string;
    type: string;
    title: string;
    description: string;
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    metadata?: Record<string, unknown>;
  },
) {
  if (!prisma?.systemInsight?.findFirst || !prisma?.systemInsight?.create) return null;

  const existing = await prisma.systemInsight.findFirst({
    where: {
      workspaceId: input.workspaceId,
      type: input.type,
      title: input.title,
      createdAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    },
  });

  if (existing) return existing;

  return prisma.systemInsight.create({
    data: {
      workspaceId: input.workspaceId,
      type: input.type,
      title: input.title,
      description: input.description,
      severity: input.severity,
      metadata: input.metadata ? toJsonValue(input.metadata) : undefined,
    },
  });
}
