export interface CommercialGraphNode {
  id: string;
  kind: 'action' | 'belief' | 'contact' | 'event' | 'intent' | 'policy' | 'status' | 'workspace';
  label: string;
  weight: number;
}

export interface CommercialGraphEdge {
  from: string;
  label: string;
  to: string;
  weight: number;
}

export interface CommercialGraphRecommendation {
  action: string;
  confidence: number;
  reason: string;
  toxicityFlag?: 'healthy' | 'regression' | 'toxic';
  toxicPolicyCount?: number;
}

export interface CommercialGraphWindow {
  beliefCount?: number;
  eventCount: number;
  policyCount?: number;
  take: number;
}
