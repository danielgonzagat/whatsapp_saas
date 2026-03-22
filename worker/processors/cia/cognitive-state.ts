import { randomUUID } from "crypto";
import type { DemandState } from "../../providers/commercial-intelligence";

export type CustomerIntent =
  | "BUYING"
  | "PAYMENT"
  | "SUPPORT"
  | "OBJECTION"
  | "CURIOUS"
  | "POST_SALE"
  | "UNKNOWN";

export type CustomerStage =
  | "COLD"
  | "WARM"
  | "HOT"
  | "CHECKOUT"
  | "POST_SALE"
  | "SUPPORT";

export type CognitiveActionType =
  | "RESPOND"
  | "ASK_CLARIFYING"
  | "SOCIAL_PROOF"
  | "OFFER"
  | "FOLLOWUP_SOFT"
  | "FOLLOWUP_URGENT"
  | "PAYMENT_RECOVERY"
  | "WAIT"
  | "ESCALATE_HUMAN";

export interface CustomerCognitiveState {
  conversationId?: string | null;
  contactId?: string | null;
  phone?: string | null;
  contactName?: string | null;
  intent: CustomerIntent;
  stage: CustomerStage;
  trustScore: number;
  urgencyScore: number;
  priceSensitivity: number;
  objections: string[];
  desires: string[];
  trustSignals: string[];
  lastOffer?: string | null;
  lastAction?: string | null;
  nextBestAction: CognitiveActionType;
  silenceMinutes: number;
  ltvEstimate: number;
  paymentState: "NONE" | "PENDING" | "READY_TO_PAY" | "PAID";
  lastOutcome?: string | null;
  riskFlags: string[];
  emotionalTone?:
    | "positive"
    | "negative"
    | "neutral"
    | "frustrated"
    | "excited"
    | "anxious"
    | "confused";
  disclosureLevel?: number;
  corePain?: string | null;
  preferredStyle?: "direct" | "empathetic" | "consultative" | "technical";
  nextBestQuestion?: string | null;
  classificationConfidence: number;
  summary: string;
  updatedAt: string;
}

export interface RecordDecisionOutcomeInput {
  workspaceId: string;
  contactId?: string;
  conversationId?: string;
  phone?: string;
  action: CognitiveActionType | string;
  outcome: string;
  reward?: number;
  message?: string;
  metadata?: Record<string, any>;
}

const BUYING_HINTS = [
  "preco",
  "preço",
  "valor",
  "quanto",
  "custa",
  "parcel",
  "pix",
  "boleto",
  "comprar",
  "quero",
  "fechar",
  "pagar",
  "pagamento",
];

const SUPPORT_HINTS = [
  "suporte",
  "ajuda",
  "erro",
  "problema",
  "nao chegou",
  "não chegou",
  "atraso",
  "cancel",
  "troca",
  "reembolso",
  "devolu",
];

const LEGAL_RISK_HINTS = [
  "procon",
  "advog",
  "process",
  "reclama",
  "justi",
  "jurid",
  "amea",
];

const TRUST_OBJECTION_HINTS = [
  "funciona",
  "confiavel",
  "confiável",
  "garantia",
  "seguro",
  "depoimento",
  "resultado",
];

const URGENCY_HINTS = [
  "hoje",
  "agora",
  "urgente",
  "rapido",
  "rápido",
  "ainda hoje",
  "essa semana",
];

const DESIRE_HINTS: Array<{ keyword: string; tag: string }> = [
  { keyword: "resultado", tag: "resultado_rapido" },
  { keyword: "seguro", tag: "seguranca" },
  { keyword: "natural", tag: "naturalidade" },
  { keyword: "parcela", tag: "parcelamento" },
  { keyword: "pix", tag: "facilidade_pagamento" },
];

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function normalizeText(value?: string | null) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function uniqueTokens(values: Array<string | null | undefined>) {
  return [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))];
}

function inferPaymentState(text: string) {
  if (/(pago|paguei|compensado|confirmado)/i.test(text)) {
    return "PAID" as const;
  }
  if (/(pix|boleto|link|pagamento|pagar|cartao|cartão)/i.test(text)) {
    return "PENDING" as const;
  }
  if (/(quero fechar|quero pagar|manda o link|me cobra)/i.test(text)) {
    return "READY_TO_PAY" as const;
  }
  return "NONE" as const;
}

function inferIntent(params: {
  text: string;
  unreadCount: number;
  paymentState: CustomerCognitiveState["paymentState"];
  leadScore?: number | null;
}) {
  const { text, unreadCount, paymentState } = params;
  if (paymentState === "PENDING" || paymentState === "READY_TO_PAY") {
    return "PAYMENT" as const;
  }
  if (includesAny(text, SUPPORT_HINTS)) {
    return "SUPPORT" as const;
  }
  if (includesAny(text, BUYING_HINTS)) {
    return "BUYING" as const;
  }
  if (includesAny(text, TRUST_OBJECTION_HINTS)) {
    return "OBJECTION" as const;
  }
  if ((Number(params.leadScore || 0) || 0) >= 70 || unreadCount > 0) {
    return "CURIOUS" as const;
  }
  return "UNKNOWN" as const;
}

function inferStage(params: {
  intent: CustomerIntent;
  paymentState: CustomerCognitiveState["paymentState"];
  trustScore: number;
  urgencyScore: number;
}) {
  if (params.intent === "SUPPORT") return "SUPPORT" as const;
  if (params.paymentState === "PAID") return "POST_SALE" as const;
  if (
    params.paymentState === "PENDING" ||
    params.paymentState === "READY_TO_PAY"
  ) {
    return "CHECKOUT" as const;
  }
  if (params.intent === "BUYING" && (params.trustScore >= 0.58 || params.urgencyScore >= 0.72)) {
    return "HOT" as const;
  }
  if (params.intent === "BUYING" || params.intent === "CURIOUS" || params.intent === "OBJECTION") {
    return "WARM" as const;
  }
  return "COLD" as const;
}

function inferObjections(text: string) {
  const objections: string[] = [];
  if (/(preco|preço|valor|caro|desconto|parcel)/i.test(text)) {
    objections.push("price");
  }
  if (/(funciona|garantia|seguro|confi|resultado|verdade)/i.test(text)) {
    objections.push("trust");
  }
  if (/(prazo|demora|entrega|quando|hoje ainda)/i.test(text)) {
    objections.push("timing");
  }
  return objections;
}

function inferDesires(text: string) {
  return uniqueTokens(
    DESIRE_HINTS.filter((item) => text.includes(item.keyword)).map((item) => item.tag),
  );
}

function inferRiskFlags(text: string, intent: CustomerIntent) {
  const riskFlags: string[] = [];
  if (includesAny(text, LEGAL_RISK_HINTS)) {
    riskFlags.push("LEGAL_RISK");
  }
  if (/(reembolso|cancel|devolu)/i.test(text)) {
    riskFlags.push("REFUND_RISK");
  }
  if (/(medic|receita|laudo|reacao|reação|dor forte)/i.test(text)) {
    riskFlags.push("HEALTH_RISK");
  }
  if (intent === "SUPPORT") {
    riskFlags.push("SUPPORT_REQUIRED");
  }
  return uniqueTokens(riskFlags);
}

function inferTrustSignals(text: string) {
  const trustSignals: string[] = [];
  if (/(obrigad|valeu|perfeito|gostei|entendi)/i.test(text)) {
    trustSignals.push("positive_ack");
  }
  if (/(quero|vou fechar|me manda|pode ser)/i.test(text)) {
    trustSignals.push("buying_signal");
  }
  if (/(funciona|garantia|depoimento)/i.test(text)) {
    trustSignals.push("needs_proof");
  }
  return uniqueTokens(trustSignals);
}

function inferEmotionalTone(text: string) {
  if (/(ansios|insegur|medo|receio)/i.test(text)) {
    return "anxious" as const;
  }
  if (/(frustr|cansad|raiva|problema|erro|dificil|difícil|complicado)/i.test(text)) {
    return "frustrated" as const;
  }
  if (/(nao entendi|não entendi|confuso|como assim|explica)/i.test(text)) {
    return "confused" as const;
  }
  if (/(perfeito|gostei|amei|animad|valeu|obrigad)/i.test(text)) {
    return "positive" as const;
  }
  if (/(quero|fechar|manda|agora|partiu)/i.test(text)) {
    return "excited" as const;
  }
  if (/(nao|não|caro|demora|duvida|dúvida)/i.test(text)) {
    return "negative" as const;
  }
  return "neutral" as const;
}

function inferDisclosureLevel(text: string) {
  const wordCount = String(text || "").split(/\s+/).filter(Boolean).length;
  const personalMarkers = (text.match(/\b(meu|minha|meus|minhas|empresa|rotina|cliente|trabalho)\b/gi) || []).length;
  return Number(clamp(wordCount / 40 + personalMarkers * 0.08, 0, 1).toFixed(3));
}

function inferCorePain(text: string, objections: string[], desires: string[]) {
  if (objections.includes("price")) return "receio de investir sem retorno";
  if (objections.includes("trust")) return "medo de errar ou ser enganado";
  if (objections.includes("timing")) return "urgencia com receio de demora";
  if (desires.includes("resultado_rapido")) return "quer resultado perceptivel rapido";
  if (desires.includes("seguranca")) return "busca seguranca para decidir";
  if (/(nao resolveu|não resolveu|tentei de tudo|ja tentei|já tentei)/i.test(text)) {
    return "frustracao por tentativas anteriores sem resultado";
  }
  return null;
}

function inferPreferredStyle(text: string, emotionalTone: string) {
  if (/(como funciona|composi|tecnico|detalhe|explica melhor)/i.test(text)) {
    return "technical" as const;
  }
  if (emotionalTone === "frustrated" || emotionalTone === "anxious") {
    return "empathetic" as const;
  }
  if (/(preco|preço|quanto|prazo|agora)/i.test(text)) {
    return "direct" as const;
  }
  return "consultative" as const;
}

function inferNextBestQuestion(input: {
  stage: CustomerStage;
  emotionalTone: string;
  objections: string[];
  corePain?: string | null;
}) {
  if (input.objections.includes("price")) {
    return "O que pesa mais pra voce hoje: investimento ou seguranca da decisao?";
  }
  if (input.objections.includes("trust")) {
    return "Qual parte voce precisa sentir mais seguranca antes de avancar?";
  }
  if (input.emotionalTone === "frustrated") {
    return "O que mais te desgasta nisso hoje?";
  }
  if (input.stage === "COLD") {
    return "O que te trouxe aqui agora?";
  }
  if (input.stage === "WARM") {
    return "Qual resultado faria isso valer a pena pra voce?";
  }
  if (input.corePain) {
    return "Quando isso acontece, o que mais pesa no seu dia a dia?";
  }
  return null;
}

function inferConfidence(input: {
  intent: CustomerIntent;
  riskFlags: string[];
  objections: string[];
  unreadCount: number;
}) {
  let confidence = 0.58;
  if (input.intent === "BUYING" || input.intent === "PAYMENT") confidence += 0.18;
  if (input.intent === "SUPPORT") confidence -= 0.12;
  if (input.objections.length > 0) confidence += 0.04;
  if (input.riskFlags.length > 0) confidence -= 0.18;
  if (input.unreadCount > 1) confidence += 0.05;
  return Number(clamp(confidence, 0.1, 0.98).toFixed(3));
}

function inferNextBestAction(input: {
  intent: CustomerIntent;
  stage: CustomerStage;
  unreadCount: number;
  silenceMinutes: number;
  trustScore: number;
  urgencyScore: number;
  priceSensitivity: number;
  paymentState: CustomerCognitiveState["paymentState"];
  riskFlags: string[];
  objections: string[];
  desires: string[];
  confidence: number;
}) {
  if (input.riskFlags.length > 0) {
    return "ESCALATE_HUMAN" as const;
  }
  if (
    input.intent === "UNKNOWN" &&
    input.unreadCount > 0 &&
    input.confidence < 0.68
  ) {
    return "ASK_CLARIFYING" as const;
  }
  if (
    input.paymentState === "PENDING" ||
    input.paymentState === "READY_TO_PAY" ||
    input.intent === "PAYMENT"
  ) {
    return "PAYMENT_RECOVERY" as const;
  }
  if (input.unreadCount > 0) {
    if (
      input.objections.includes("price") &&
      input.trustScore < 0.62
    ) {
      return "SOCIAL_PROOF" as const;
    }
    if (
      input.stage === "HOT" ||
      input.stage === "CHECKOUT" ||
      input.urgencyScore >= 0.7 ||
      input.desires.includes("resultado_rapido")
    ) {
      return "OFFER" as const;
    }
    return "RESPOND" as const;
  }
  if (input.silenceMinutes >= 24 * 60 || (input.urgencyScore >= 0.72 && input.stage === "HOT")) {
    return "FOLLOWUP_URGENT" as const;
  }
  if (input.silenceMinutes >= 6 * 60 || input.stage === "WARM") {
    return "FOLLOWUP_SOFT" as const;
  }
  return "WAIT" as const;
}

function summarizeState(input: {
  intent: CustomerIntent;
  stage: CustomerStage;
  objections: string[];
  nextBestAction: CognitiveActionType;
  paymentState: CustomerCognitiveState["paymentState"];
  trustScore: number;
  urgencyScore: number;
  riskFlags: string[];
}) {
  const parts = [
    `intenção ${input.intent.toLowerCase()}`,
    `estágio ${input.stage.toLowerCase()}`,
    `próxima ação ${input.nextBestAction.toLowerCase()}`,
  ];
  if (input.paymentState !== "NONE") {
    parts.push(`pagamento ${input.paymentState.toLowerCase()}`);
  }
  if (input.objections.length > 0) {
    parts.push(`objeções ${input.objections.join(", ")}`);
  }
  parts.push(`confiança ${Math.round(input.trustScore * 100)}%`);
  parts.push(`urgência ${Math.round(input.urgencyScore * 100)}%`);
  if (input.riskFlags.length > 0) {
    parts.push(`riscos ${input.riskFlags.join(", ")}`);
  }
  return parts.join(" • ");
}

export function buildSeedCognitiveState(input: {
  conversationId?: string | null;
  contactId?: string | null;
  phone?: string | null;
  contactName?: string | null;
  lastMessageText?: string | null;
  unreadCount?: number;
  lastMessageAt?: Date | string | null;
  leadScore?: number | null;
  previousState?: Partial<CustomerCognitiveState> | null;
  demandState?: DemandState | null;
  lastOutcome?: string | null;
  lastAction?: string | null;
}) {
  const text = normalizeText(input.lastMessageText);
  const unreadCount = Number(input.unreadCount || 0) || 0;
  const silenceMinutes = input.lastMessageAt
    ? Math.max(
        0,
        Math.round(
          (Date.now() - new Date(input.lastMessageAt).getTime()) / 60_000,
        ),
      )
    : 0;
  const previous = input.previousState || null;
  const paymentState = inferPaymentState(text);
  const intent = inferIntent({
    text,
    unreadCount,
    paymentState,
    leadScore: input.leadScore,
  });
  const objections = uniqueTokens([
    ...(previous?.objections || []),
    ...inferObjections(text),
  ]);
  const desires = uniqueTokens([
    ...(previous?.desires || []),
    ...inferDesires(text),
  ]);
  const trustSignals = uniqueTokens([
    ...(previous?.trustSignals || []),
    ...inferTrustSignals(text),
  ]);
  const riskFlags = uniqueTokens([
    ...(previous?.riskFlags || []),
    ...inferRiskFlags(text, intent),
  ]);
  const emotionalTone = inferEmotionalTone(text);
  const disclosureLevel = inferDisclosureLevel(text);
  const corePain = inferCorePain(text, objections, desires);
  const preferredStyle = inferPreferredStyle(text, emotionalTone);
  const trustScore = Number(
    clamp(
      (Number(previous?.trustScore || 0.45) || 0.45) * 0.45 +
        clamp((Number(input.leadScore || 0) || 0) / 100, 0, 1) * 0.3 +
        (trustSignals.includes("positive_ack") ? 0.12 : 0) +
        (trustSignals.includes("buying_signal") ? 0.1 : 0) -
        (objections.includes("trust") ? 0.08 : 0),
      0,
      1,
    ).toFixed(3),
  );
  const urgencyScore = Number(
    clamp(
      (Number(previous?.urgencyScore || 0.2) || 0.2) * 0.35 +
        (includesAny(text, URGENCY_HINTS) ? 0.35 : 0) +
        Math.min(unreadCount / 4, 0.2) +
        (input.demandState?.attentionScore || 0) * 0.25,
      0,
      1,
    ).toFixed(3),
  );
  const priceSensitivity = Number(
    clamp(
      (Number(previous?.priceSensitivity || 0.15) || 0.15) * 0.45 +
        (objections.includes("price") ? 0.4 : 0) +
        (text.includes("parcel") ? 0.15 : 0) +
        (text.includes("desconto") ? 0.15 : 0),
      0,
      1,
    ).toFixed(3),
  );
  const stage = inferStage({
    intent,
    paymentState,
    trustScore,
    urgencyScore,
  });
  const confidence = inferConfidence({
    intent,
    riskFlags,
    objections,
    unreadCount,
  });
  const nextBestAction = inferNextBestAction({
    intent,
    stage,
    unreadCount,
    silenceMinutes,
    trustScore,
    urgencyScore,
    priceSensitivity,
    paymentState,
    riskFlags,
    objections,
    desires,
    confidence,
  });
  const nextBestQuestion = inferNextBestQuestion({
    stage,
    emotionalTone,
    objections,
    corePain,
  });
  const ltvEstimate = Number(
    (
      (Number(input.leadScore || 0) || 0) * 4 +
      trustScore * 180 +
      urgencyScore * 120 +
      (stage === "CHECKOUT" ? 140 : stage === "HOT" ? 90 : 30)
    ).toFixed(2),
  );

  const state: CustomerCognitiveState = {
    conversationId: input.conversationId || previous?.conversationId || null,
    contactId: input.contactId || previous?.contactId || null,
    phone: input.phone || previous?.phone || null,
    contactName: input.contactName || previous?.contactName || null,
    intent,
    stage,
    trustScore,
    urgencyScore,
    priceSensitivity,
    objections,
    desires,
    trustSignals,
    lastOffer: previous?.lastOffer || null,
    lastAction: input.lastAction || previous?.lastAction || null,
    nextBestAction,
    silenceMinutes,
    ltvEstimate,
    paymentState,
    lastOutcome: input.lastOutcome || previous?.lastOutcome || null,
    riskFlags,
    emotionalTone,
    disclosureLevel,
    corePain,
    preferredStyle,
    nextBestQuestion,
    classificationConfidence: confidence,
    summary: "",
    updatedAt: new Date().toISOString(),
  };

  state.summary = summarizeState({
    intent: state.intent,
    stage: state.stage,
    objections: state.objections,
    nextBestAction: state.nextBestAction,
    paymentState: state.paymentState,
    trustScore: state.trustScore,
    urgencyScore: state.urgencyScore,
    riskFlags: state.riskFlags,
  });

  return state;
}

function buildStateKey(input: {
  conversationId?: string | null;
  contactId?: string | null;
  phone?: string | null;
}) {
  return `cognitive_state:${input.conversationId || input.contactId || input.phone || "workspace"}`;
}

export async function loadCustomerCognitiveState(
  prisma: any,
  input: {
    workspaceId: string;
    conversationId?: string | null;
    contactId?: string | null;
    phone?: string | null;
  },
): Promise<CustomerCognitiveState | null> {
  if (!prisma?.kloelMemory?.findUnique) return null;
  const key = buildStateKey(input);
  const record = await prisma.kloelMemory
    .findUnique({
      where: {
        workspaceId_key: {
          workspaceId: input.workspaceId,
          key,
        },
      },
    })
    .catch(() => null);

  return ((record?.value || null) as CustomerCognitiveState | null) || null;
}

export async function persistCustomerCognitiveState(
  prisma: any,
  input: {
    workspaceId: string;
    conversationId?: string | null;
    contactId?: string | null;
    phone?: string | null;
    contactName?: string | null;
    state: CustomerCognitiveState;
    source?: string;
  },
) {
  if (!prisma?.kloelMemory?.upsert) return input.state;

  const key = buildStateKey(input);
  const previous = prisma?.kloelMemory?.findUnique
    ? await prisma.kloelMemory
        .findUnique({
          where: {
            workspaceId_key: {
              workspaceId: input.workspaceId,
              key,
            },
          },
        })
        .catch(() => null)
    : null;

  const normalizedState = {
    ...input.state,
    conversationId: input.conversationId || input.state.conversationId || null,
    contactId: input.contactId || input.state.contactId || null,
    phone: input.phone || input.state.phone || null,
    contactName: input.contactName || input.state.contactName || null,
    updatedAt: new Date().toISOString(),
  } satisfies CustomerCognitiveState;

  await prisma.kloelMemory.upsert({
    where: {
      workspaceId_key: {
        workspaceId: input.workspaceId,
        key,
      },
    },
    update: {
      value: normalizedState,
      metadata: {
        source: input.source || "autonomy",
        contactId: normalizedState.contactId || null,
        conversationId: normalizedState.conversationId || null,
        phone: normalizedState.phone || null,
        nextBestAction: normalizedState.nextBestAction,
        intent: normalizedState.intent,
        stage: normalizedState.stage,
      },
      content: normalizedState.summary,
    },
    create: {
      workspaceId: input.workspaceId,
      key,
      category: "cognitive_state",
      type: normalizedState.intent,
      content: normalizedState.summary,
      value: normalizedState,
      metadata: {
        source: input.source || "autonomy",
        contactId: normalizedState.contactId || null,
        conversationId: normalizedState.conversationId || null,
        phone: normalizedState.phone || null,
        nextBestAction: normalizedState.nextBestAction,
        intent: normalizedState.intent,
        stage: normalizedState.stage,
      },
    },
  });

  if (
    prisma?.kloelMemory?.create &&
    JSON.stringify(previous?.value || null) !== JSON.stringify(normalizedState)
  ) {
    await prisma.kloelMemory
      .create({
        data: {
          workspaceId: input.workspaceId,
          key: `cognitive_delta:${normalizedState.contactId || normalizedState.phone || "workspace"}:${Date.now()}:${randomUUID()}`,
          category: "cognitive_delta",
          type: normalizedState.nextBestAction,
          content: normalizedState.summary,
          value: {
            previous: previous?.value || null,
            current: normalizedState,
            source: input.source || "autonomy",
          },
          metadata: {
            contactId: normalizedState.contactId || null,
            conversationId: normalizedState.conversationId || null,
            phone: normalizedState.phone || null,
          },
        },
      })
      .catch(() => null);
  }

  if (normalizedState.contactId && prisma?.contact?.update) {
    await prisma.contact
      .update({
        where: { id: normalizedState.contactId },
        data: {
          leadScore: Math.max(
            0,
            Math.min(100, Math.round(normalizedState.trustScore * 55 + normalizedState.urgencyScore * 45)),
          ),
          purchaseProbability: Number(
            clamp(
              normalizedState.stage === "CHECKOUT"
                ? 0.86
                : normalizedState.stage === "HOT"
                  ? 0.7
                  : normalizedState.stage === "WARM"
                    ? 0.42
                    : 0.18,
              0,
              1,
            ).toFixed(3),
          ),
          nextBestAction: normalizedState.nextBestAction,
          aiSummary: normalizedState.summary,
        },
      })
      .catch(() => null);
  }

  return normalizedState;
}

export async function recordDecisionOutcome(prisma: any, input: RecordDecisionOutcomeInput) {
  if (!prisma?.kloelMemory?.create) return null;

  return prisma.kloelMemory.create({
    data: {
      workspaceId: input.workspaceId,
      key: `decision_outcome:${input.contactId || input.phone || input.conversationId || "workspace"}:${Date.now()}:${randomUUID()}`,
      category: "decision_outcome",
      type: String(input.action || "UNKNOWN"),
      content: input.message || String(input.action || "UNKNOWN"),
      value: {
        action: input.action,
        outcome: input.outcome,
        reward: input.reward || 0,
        message: input.message || null,
        conversationId: input.conversationId || null,
        metadata: input.metadata || {},
      },
      metadata: {
        contactId: input.contactId || null,
        conversationId: input.conversationId || null,
        phone: input.phone || null,
        outcome: input.outcome,
      },
    },
  });
}
