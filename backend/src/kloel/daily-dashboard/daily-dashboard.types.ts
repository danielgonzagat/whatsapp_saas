

export interface SuggestedAction {
  readonly kind: 'contact_lead' | 'recover_cart' | 'follow_up' | 'review_deal' | 'investigate';
  readonly targetType: string;
  readonly targetId: string;
  readonly reason: string;
  readonly priority: number;
}

export interface TopOpportunity {
  readonly goalId: string;
  readonly summary: string;
  readonly impact: number;
  readonly viability: number;
  readonly risk: number;
  readonly score: number;
}

export interface CommercialMood {
  readonly positive: number;
  readonly negative: number;
  readonly neutral: number;
  readonly ambiguous: number;
  readonly windowHours: number;
}

export interface DailyDashboard {
  readonly workspaceId: string;
  readonly generatedAt: string;
  readonly hotLeadsWithoutResponse: number;
  readonly abandonedCarts: number;
  readonly leadsAwaitingFollowup: number;
  readonly dealsAtRisk: number;
  readonly topThreeOpportunities: readonly TopOpportunity[];
  readonly suggestedActions: readonly SuggestedAction[];
  readonly commercialMood: CommercialMood;
}
