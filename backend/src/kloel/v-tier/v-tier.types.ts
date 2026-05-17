type VtierStatus = 'PASS' | 'FAIL' | 'INSUFFICIENT_EVIDENCE';

export type VtierOverall = 'PASS' | 'PARTIAL' | 'FAIL';

export interface VerificationVerdict {
  readonly criterionId: string;
  readonly status: VtierStatus;
  readonly evidence: string;
  readonly measuredAt: string;
}

export interface VtierCertificationResult {
  readonly overall: VtierOverall;
  readonly verdicts: readonly VerificationVerdict[];
  readonly passCount: number;
  readonly failCount: number;
  readonly insufficientEvidenceCount: number;
  readonly certificationId: string;
  readonly certifiedAt: string;
}

export type { VtierStatus as VtierVerdictStatus };
