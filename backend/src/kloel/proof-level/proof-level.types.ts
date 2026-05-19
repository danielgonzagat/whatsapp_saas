type EvidenceOrigin =
  | 'mental_simulation'
  | 'synthetic_scenario'
  | 'code_run'
  | 'observed_user'
  | 'user_confirmed'
  | 'commercial_outcome';

export type ProofLevel = 'N1' | 'N2' | 'N3' | 'N4' | 'N5' | 'N6';

type CommercialMetricKind = 'ltv' | 'conversion' | 'retention' | 'churn_reduction';

interface CommercialMetric {
  readonly kind: CommercialMetricKind;
  readonly delta: number;
}

export interface EvidenceDescriptor {
  readonly origin: EvidenceOrigin;
  readonly sampleSize: number;
  readonly observedAt?: string;
  readonly confirmedBy?: string;
  readonly commercialMetric?: CommercialMetric;
}

export interface ProofClassification {
  readonly level: ProofLevel;
  readonly canDeclareProvado: boolean;
  readonly readyForRealValidation: boolean;
  readonly missingForNextLevel: readonly string[];
}
