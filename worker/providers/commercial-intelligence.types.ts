/** Demand lane type. */
export type DemandLane = 'HOT' | 'WARM' | 'COLD' | 'SLEEP' | 'DEAD';
/** Demand strategy type. */
export type DemandStrategy = 'PUSH' | 'EDUCATE' | 'NURTURE' | 'WAIT' | 'DROP' | 'RECOVER_PAYMENT';
/** Response tone type. */
export type ResponseTone = 'short' | 'normal' | 'persuasive' | 'aggressive' | 'explain';
/** Runtime mode type. */
export type RuntimeMode = 'ASSIST' | 'AUTONOMOUS';
/** Next action type. */
export type NextAction = 'WAIT' | 'FOLLOWUP' | 'CREATE_LINK' | 'ESCALATE';

/** Demand state shape. */
export interface DemandState {
  /** Heat score property. */
  heatScore: number;
  /** Fatigue score property. */
  fatigueScore: number;
  /** Conversion odds property. */
  conversionOdds: number;
  /** Abandonment risk property. */
  abandonmentRisk: number;
  /** Lane property. */
  lane: DemandLane;
  /** Strategy property. */
  strategy: DemandStrategy;
  /** Attention score property. */
  attentionScore: number;
  /** Reactivation at property. */
  reactivationAt?: string;
}

/** Commercial decision envelope shape. */
export interface CommercialDecisionEnvelope {
  /** Intent property. */
  intent: string;
  /** Strategy property. */
  strategy: string;
  /** Tone property. */
  tone: ResponseTone;
  /** Reply property. */
  reply?: string;
  /** Next action property. */
  nextAction: NextAction;
  /** Confidence property. */
  confidence: number;
  /** Risk flags property. */
  riskFlags: string[];
  /** Should escalate property. */
  shouldEscalate: boolean;
  /** Capabilities property. */
  capabilities: {
    canAskQuestions: boolean;
    canBeShort: boolean;
    canBeAggressive: boolean;
    canExperiment: boolean;
    canFollowUp: boolean;
    canRetry: boolean;
  };
}

/** Market signal shape. */
export interface MarketSignal {
  /** Signal type property. */
  signalType: string;
  /** Normalized key property. */
  normalizedKey: string;
  /** Frequency property. */
  frequency: number;
  /** Examples property. */
  examples: string[];
}

/** Human task payload shape. */
export interface HumanTaskPayload {
  /** Id property. */
  id: string;
  /** Task type property. */
  taskType: string;
  /** Urgency property. */
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  /** Reason property. */
  reason: string;
  /** Suggested reply property. */
  suggestedReply?: string;
  /** Business impact property. */
  businessImpact?: string;
  /** Contact id property. */
  contactId?: string;
  /** Phone property. */
  phone?: string;
  /** Conversation id property. */
  conversationId?: string | null;
  /** Status property. */
  status?: 'OPEN' | 'APPROVED' | 'REJECTED' | 'RESOLVED';
  /** Resolved at property. */
  resolvedAt?: string;
  /** Approved reply property. */
  approvedReply?: string | null;
  /** Created at property. */
  createdAt: string;
}

/** Business state snapshot shape. */
export interface BusinessStateSnapshot {
  /** Open backlog property. */
  openBacklog: number;
  /** Hot lead count property. */
  hotLeadCount: number;
  /** Pending payment count property. */
  pendingPaymentCount: number;
  /** Approved sales count property. */
  approvedSalesCount: number;
  /** Approved sales amount property. */
  approvedSalesAmount: number;
  /** Avg response minutes property. */
  avgResponseMinutes: number;
  /** Dominant objection property. */
  dominantObjection: string | null;
  /** Top product key property. */
  topProductKey: string | null;
  /** Growth risk level property. */
  growthRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  /** Attention budget property. */
  attentionBudget: {
    hot: number;
    pendingPayments: number;
    support: number;
    nurture: number;
    cold: number;
  };
  /** Generated at property. */
  generatedAt: string;
}
