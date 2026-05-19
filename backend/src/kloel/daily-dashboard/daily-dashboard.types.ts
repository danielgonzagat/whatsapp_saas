

export interface SuggestedAction {
  readonly kind: 'contact_lead' | 'recover_cart' | 'follow_up' | 'review_deal' | 'investigate';
  readonly targetType: string;
  readonly targetId: string;
  readonly reason: string;
  readonly priority: number;
  readonly riskClass?: 'R1' | 'R2' | 'R3' | 'R4';
  readonly delegationMode?: 'allowed_alone' | 'requires_approval' | 'escalate_to_human';
  readonly rollback?: string;
}

export interface TopOpportunity {
  readonly goalId: string;
  readonly summary: string;
  readonly impact: number;
  readonly viability: number;
  readonly risk: number;
  readonly score: number;
}

interface CommercialMood {
  readonly positive: number;
  readonly negative: number;
  readonly neutral: number;
  readonly ambiguous: number;
  readonly windowHours: number;
}

export interface NoRegretHighlight {
  readonly count: number;
  readonly headline: string;
  readonly reason: string;
  readonly evidenceEventIds: readonly string[];
  readonly riskClass: 'R1';
  readonly delegationMode: 'allowed_alone';
}

export interface NowFocus {
  readonly urgency: 'now' | 'this_week' | 'for_awareness' | 'archive';
  readonly headline: string;
  readonly safeNextStep: string;
  readonly reason: string;
  readonly targetType?: string;
  readonly targetId?: string;
  readonly riskClass: 'R1' | 'R2' | 'R3' | 'R4';
  readonly delegationMode: 'allowed_alone' | 'requires_approval' | 'escalate_to_human';
  readonly rollback: 'dismiss_suggestion' | 'keep_silent';
  readonly timeToValueMinutes: number;
  readonly noRegretHighlight?: NoRegretHighlight;
}

export interface DailyDashboard {
  readonly workspaceId: string;
  readonly generatedAt: string;
  readonly hotLeadsWithoutResponse: number;
  readonly abandonedCarts: number;
  readonly leadsAwaitingFollowup: number;
  readonly dealsAtRisk: number;
  readonly silentLeads: number;
  readonly topThreeOpportunities: readonly TopOpportunity[];
  readonly suggestedActions: readonly SuggestedAction[];
  readonly nowFocus: NowFocus;
  readonly commercialMood: CommercialMood;
}
