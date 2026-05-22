import type {
  DemandState,
  DemandLane,
  DemandStrategy,
  CommercialDecisionEnvelope,
  ResponseTone,
  NextAction,
  RuntimeMode,
} from './commercial-intelligence.types';

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

export function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

export function normalized(text?: string | null) {
  return String(text || '').toLowerCase();
}

export function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

/** Compute demand state. */
export function computeDemandState(input: {
  lastMessageAt?: Date | string | null | undefined;
  unreadCount?: number | undefined;
  leadScore?: number | null | undefined;
  lastMessageText?: string | null | undefined;
  followupAttempts?: number | undefined;
  ignoredCount?: number | undefined;
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

/** Build decision envelope. */
export function buildDecisionEnvelope(input: {
  intent: string;
  action: string;
  confidence?: number | undefined;
  messageContent?: string | null | undefined;
  demandState?: DemandState | null | undefined;
  matchedProducts?: string[] | undefined;
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

/** Should autonomous send. */
export function shouldAutonomousSend(decision: CommercialDecisionEnvelope, mode: RuntimeMode) {
  const hardRisk = decision.riskFlags.some((flag) =>
    ['LEGAL_RISK', 'MEDICAL_RISK', 'PRICE_UNCERTAIN'].includes(flag),
  );

  if (hardRisk) {
    return false;
  }
  if (decision.shouldEscalate && mode === 'ASSIST') {
    return false;
  }
  if (decision.confidence >= 0.85) {
    return true;
  }
  if (mode === 'AUTONOMOUS' && decision.confidence >= 0.7) {
    return true;
  }
  return false;
}
