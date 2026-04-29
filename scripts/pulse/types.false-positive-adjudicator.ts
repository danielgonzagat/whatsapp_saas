// PULSE — Wave 7: False Positive Adjudication Engine
// Type definitions for finding lifecycle management.

export type FindingStatus =
  | 'open'
  | 'confirmed'
  | 'fixed'
  | 'false_positive'
  | 'accepted_risk'
  | 'human_required'
  | 'stale'
  | 'regressed';

export interface AdjudicatedFinding {
  findingId: string;
  title: string;
  source: 'codacy' | 'pulse' | 'sentry' | 'test' | 'lint';
  status: FindingStatus;
  severity: 'critical' | 'high' | 'medium' | 'low';
  filePath: string;
  line: number | null;
  capabilityId: string | null;
  proof: string | null;
  expiresOnFileChange: boolean;
  fileHashAtSuppression: string | null;
  suppressedAt: string | null;
  lastChecked: string;
}

export interface FalsePositiveAdjudicationState {
  generatedAt: string;
  summary: {
    totalFindings: number;
    open: number;
    confirmed: number;
    fixed: number;
    falsePositives: number;
    acceptedRisks: number;
    expiredSuppressions: number;
    precision: number;
  };
  findings: AdjudicatedFinding[];
}
