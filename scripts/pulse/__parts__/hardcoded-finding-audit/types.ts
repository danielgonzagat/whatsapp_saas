export type HardcodedFindingRiskKind =
  | 'fixed_allowlist'
  | 'regex_only_break_emitter'
  | 'decision_token_regex'
  | 'hardcoded_break_push_type_risk'
  | 'fixed_break_type_mass_emitter';

export interface HardcodedFindingAuditSource {
  filePath: string;
  source: string;
}

export interface HardcodedFindingAuditFinding {
  kind: HardcodedFindingRiskKind;
  line: number;
  column: number;
  symbol: string;
  evidence: string;
  reason: string;
}

export interface HardcodedFindingAuditFile {
  filePath: string;
  findings: HardcodedFindingAuditFinding[];
}

export interface HardcodedFindingAuditArtifact {
  artifact: 'PULSE_HARDCODED_FINDING_AUDIT';
  version: 1;
  scannedFiles: number;
  totalFindings: number;
  files: HardcodedFindingAuditFile[];
}

export const MIN_COLLECTION_SIZE = 2;
export const MASS_EMITTER_TYPE_THRESHOLD = 3;

export const ALLOWLIST_NAME_RE =
  /(?:^|[^a-z])(?:allow(?:ed|list)?|denylist|blocklist|known|fixed|supported|permitted|accepted|whitelist|blacklist)(?:$|[^a-z])/i;
export const BREAK_TYPE_RE = /^[A-Z][A-Z0-9_]{2,}$/;
