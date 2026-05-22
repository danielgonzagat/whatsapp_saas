import type { CiaActionType, CiaCandidate, CiaCluster } from './build-state';
import type { CustomerCognitiveState } from './cognitive-state';
import type { ConversationTacticCandidate, ConversationTacticType } from './conversation-tactics';

/** Cia governor verdict type. */
export type CiaGovernorVerdict = 'EXECUTE' | 'ASK' | 'WAIT' | 'ESCALATE';

/** Cia action decision shape. */
export interface CiaActionDecision {
  type: CiaActionType;
  cluster: CiaCluster;
  contactId?: string | undefined;
  phone?: string | undefined;
  contactName?: string | undefined;
  conversationId: string;
  priority: number;
  reason: string;
  lastMessageText: string;
  variantFamily?: 'followup' | 'payment_recovery' | undefined;
  confidence: number;
  riskScore: number;
  rewardScore: number;
  selectedActionUtility: number;
  selectedActionRank: number;
  betterActionCount: number;
  betterExecutableActionCount: number;
  nextBestActionType: CiaActionType | null;
  nextBestActionUtility: number | null;
  governor: CiaGovernorVerdict;
  conversationActionUniverse: ConversationActionCandidate[];
  conversationTactic: ConversationTacticType | null;
  selectedTacticUtility: number | null;
  selectedTacticRank: number | null;
  betterTacticCount: number;
  nextBestTactic: ConversationTacticType | null;
  nextBestTacticUtility: number | null;
  conversationTacticUniverse: ConversationTacticCandidate[];
  cognitiveState: CustomerCognitiveState;
  demandState: CiaCandidate['demandState'];
  recommendedBy: 'nba_engine';
}

/** Cia decision batch shape. */
export interface CiaDecisionBatch {
  actions: CiaActionDecision[];
  ignoredCount: number;
  summary: string;
}

/** Cia strategy hints shape. */
export interface CiaStrategyHints {
  aggressiveness?: 'LOW' | 'MEDIUM' | 'HIGH';
  preferredVariantFamily?: string | null;
  confidence?: number;
}

/** Conversation action candidate shape. */
export interface ConversationActionCandidate {
  type: CiaActionType;
  governor: CiaGovernorVerdict;
  reason: string;
  utility: number;
  rank: number;
  utilityGapToBest: number;
  betterActionCount: number;
  confidence: number;
  riskScore: number;
  rewardScore: number;
  executable: boolean;
  selected: boolean;
  variantFamily?: 'followup' | 'payment_recovery' | undefined;
}

export interface ActionOption {
  type: CiaActionType;
  reason: string;
  rewardScore: number;
  riskScore: number;
  confidence: number;
  variantFamily?: 'followup' | 'payment_recovery' | undefined;
}

export interface OptionBaseline {
  baseConfidence: number;
  baseReward: number;
  baseRisk: number;
}
