import { normalizeText, uniqueTokens } from './cognitive-state-types';
import type {
  CustomerIntent,
  CustomerStage,
  CognitiveActionType,
  CustomerCognitiveState,
} from './cognitive-state-types';
import {
  inferPaymentState,
  inferIntent,
  inferStage,
  inferObjections,
  inferDesires,
  inferTrustSignals,
  inferRiskFlags,
  inferEmotionalTone,
  inferDisclosureLevel,
  inferCorePain,
  inferPreferredStyle,
  inferNextBestQuestion,
  inferConfidence,
  inferNextBestAction,
  summarizeState,
  type SeedCognitiveStateInput,
} from './cognitive-state-inference';
import {
  computeSilenceMinutes,
  computeTrustScore,
  computeUrgencyScore,
  computePriceSensitivity,
  computeLtvEstimate,
} from './cognitive-state-scoring';

interface DerivedSignals {
  text: string;
  unreadCount: number;
  silenceMinutes: number;
  previous: Partial<CustomerCognitiveState> | null;
  paymentState: CustomerCognitiveState['paymentState'];
  intent: CustomerIntent;
  objections: string[];
  desires: string[];
  trustSignals: string[];
  riskFlags: string[];
  emotionalTone: NonNullable<CustomerCognitiveState['emotionalTone']>;
  disclosureLevel: number;
  corePain: string | null;
  preferredStyle: NonNullable<CustomerCognitiveState['preferredStyle']>;
}

function deriveSignals(input: SeedCognitiveStateInput): DerivedSignals {
  const text = normalizeText(input.lastMessageText);
  const unreadCount = Number(input.unreadCount || 0) || 0;
  const silenceMinutes = computeSilenceMinutes(input.lastMessageAt);
  const previous = input.previousState || null;
  const paymentState = inferPaymentState(text);
  const intent = inferIntent({ text, unreadCount, paymentState, leadScore: input.leadScore });
  const objections = uniqueTokens([...(previous?.objections || []), ...inferObjections(text)]);
  const desires = uniqueTokens([...(previous?.desires || []), ...inferDesires(text)]);
  const trustSignals = uniqueTokens([
    ...(previous?.trustSignals || []),
    ...inferTrustSignals(text),
  ]);
  const riskFlags = uniqueTokens([...(previous?.riskFlags || []), ...inferRiskFlags(text, intent)]);
  const emotionalTone = inferEmotionalTone(text);
  const disclosureLevel = inferDisclosureLevel(text);
  const corePain = inferCorePain(text, objections, desires);
  const preferredStyle = inferPreferredStyle(text, emotionalTone);
  return {
    text,
    unreadCount,
    silenceMinutes,
    previous,
    paymentState,
    intent,
    objections,
    desires,
    trustSignals,
    riskFlags,
    emotionalTone,
    disclosureLevel,
    corePain,
    preferredStyle,
  };
}

interface DerivedScores {
  trustScore: number;
  urgencyScore: number;
  priceSensitivity: number;
  stage: CustomerStage;
  confidence: number;
  ltvEstimate: number;
}

function computeDerivedScores(
  input: SeedCognitiveStateInput,
  signals: DerivedSignals,
): DerivedScores {
  const { previous } = signals;
  const trustScore = computeTrustScore({
    previous,
    leadScore: input.leadScore,
    trustSignals: signals.trustSignals,
    objections: signals.objections,
  });
  const urgencyScore = computeUrgencyScore({
    previous,
    text: signals.text,
    unreadCount: signals.unreadCount,
    demandState: input.demandState,
  });
  const priceSensitivity = computePriceSensitivity({
    previous,
    text: signals.text,
    objections: signals.objections,
  });
  const stage = inferStage({
    intent: signals.intent,
    paymentState: signals.paymentState,
    trustScore,
    urgencyScore,
  });
  const confidence = inferConfidence({
    intent: signals.intent,
    riskFlags: signals.riskFlags,
    objections: signals.objections,
    unreadCount: signals.unreadCount,
  });
  const ltvEstimate = computeLtvEstimate({
    leadScore: input.leadScore,
    trustScore,
    urgencyScore,
    stage,
  });
  return { trustScore, urgencyScore, priceSensitivity, stage, confidence, ltvEstimate };
}

interface RecommendedActions {
  nextBestAction: CognitiveActionType;
  nextBestQuestion: string | null | undefined;
}

function computeRecommendedActions(
  signals: DerivedSignals,
  scores: DerivedScores,
): RecommendedActions {
  const nextBestAction = inferNextBestAction({
    intent: signals.intent,
    stage: scores.stage,
    unreadCount: signals.unreadCount,
    silenceMinutes: signals.silenceMinutes,
    trustScore: scores.trustScore,
    urgencyScore: scores.urgencyScore,
    priceSensitivity: scores.priceSensitivity,
    paymentState: signals.paymentState,
    riskFlags: signals.riskFlags,
    objections: signals.objections,
    desires: signals.desires,
    confidence: scores.confidence,
  });
  const nextBestQuestion = inferNextBestQuestion({
    stage: scores.stage,
    emotionalTone: signals.emotionalTone,
    objections: signals.objections,
    corePain: signals.corePain,
  });
  return { nextBestAction, nextBestQuestion };
}

const pickContactIdentity = (
  input: SeedCognitiveStateInput,
  previous: Partial<CustomerCognitiveState> | null,
): Pick<CustomerCognitiveState, 'conversationId' | 'contactId' | 'phone' | 'contactName'> => ({
  conversationId: input.conversationId || previous?.conversationId || null,
  contactId: input.contactId || previous?.contactId || null,
  phone: input.phone || previous?.phone || null,
  contactName: input.contactName || previous?.contactName || null,
});

const pickHistoryFields = (
  input: SeedCognitiveStateInput,
  previous: Partial<CustomerCognitiveState> | null,
): Pick<CustomerCognitiveState, 'lastOffer' | 'lastAction' | 'lastOutcome'> => ({
  lastOffer: previous?.lastOffer || null,
  lastAction: input.lastAction || previous?.lastAction || null,
  lastOutcome: input.lastOutcome || previous?.lastOutcome || null,
});

const buildCognitiveStatePayload = (
  input: SeedCognitiveStateInput,
  signals: DerivedSignals,
  scores: DerivedScores,
  recommended: RecommendedActions,
): CustomerCognitiveState => {
  const { previous } = signals;
  return {
    ...pickContactIdentity(input, previous),
    intent: signals.intent,
    stage: scores.stage,
    trustScore: scores.trustScore,
    urgencyScore: scores.urgencyScore,
    priceSensitivity: scores.priceSensitivity,
    objections: signals.objections,
    desires: signals.desires,
    trustSignals: signals.trustSignals,
    ...pickHistoryFields(input, previous),
    nextBestAction: recommended.nextBestAction,
    silenceMinutes: signals.silenceMinutes,
    ltvEstimate: scores.ltvEstimate,
    paymentState: signals.paymentState,
    riskFlags: signals.riskFlags,
    emotionalTone: signals.emotionalTone,
    disclosureLevel: signals.disclosureLevel,
    corePain: signals.corePain,
    preferredStyle: signals.preferredStyle,
    nextBestQuestion: recommended.nextBestQuestion,
    classificationConfidence: scores.confidence,
    summary: '',
    updatedAt: new Date().toISOString(),
  };
};

function assembleCognitiveState(
  input: SeedCognitiveStateInput,
  signals: DerivedSignals,
): CustomerCognitiveState {
  const scores = computeDerivedScores(input, signals);
  const recommended = computeRecommendedActions(signals, scores);
  const state = buildCognitiveStatePayload(input, signals, scores, recommended);

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

export function buildSeedCognitiveState(input: SeedCognitiveStateInput): CustomerCognitiveState {
  const signals = deriveSignals(input);
  return assembleCognitiveState(input, signals);
}
