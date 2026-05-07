/**
 * PULSE Code Cortex — GitNexus Integration Types
 */
export type GitNexusAvailability = 'available' | 'missing' | 'failed' | 'unknown';
export type GitNexusIndexState = 'fresh' | 'stale' | 'missing' | 'unknown';

export interface GitNexusCommandResult {
  command: string;
  args: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

export interface GitNexusRepoStatus {
  provider: 'gitnexus';
  available: boolean;
  availability: GitNexusAvailability;
  repoRoot: string;
  currentCommit: string | null;
  indexPath: string | null;
  indexExists: boolean;
  indexState: GitNexusIndexState;
  registryDetected: boolean;
  lastIndexedCommit?: string | null;
  lastIndexedAt?: string | null;
  warnings: string[];
  errors: string[];
}

export interface GitNexusImpactInput {
  repoRoot: string;
  changedFiles: string[];
  mode: 'pre-refactor' | 'post-change' | 'manual';
}

export interface GitNexusImpactReport {
  provider: 'gitnexus';
  status: GitNexusRepoStatus;
  changedFiles: string[];
  impactedSymbols: string[];
  impactedFiles: string[];
  impactedCapabilities: string[];
  impactedFlows: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical' | 'unknown';
  evidence: string[];
  warnings: string[];
  errors: string[];
}

export interface GitNexusEvidence {
  provider: 'gitnexus';
  generatedAt: string;
  repoRoot: string;
  commit: string | null;
  status: GitNexusRepoStatus & { warnings: string[]; errors: string[] };
  impact?: GitNexusImpactReport;
  rawCommands: GitNexusCommandResult[];
}

export interface CodeGraphStatusInput {
  repoRoot: string;
}
export interface CodeGraphStatus extends GitNexusRepoStatus {}
export interface CodeGraphAnalyzeInput {
  repoRoot: string;
  force?: boolean;
  skills?: boolean;
}
export interface CodeGraphAnalyzeResult {
  indexed: boolean;
  commandResult: GitNexusCommandResult;
}
export interface CodeGraphImpactInput {
  repoRoot: string;
  changedFiles: string[];
}
export interface CodeGraphEvidenceInput {
  repoRoot: string;
}
export interface CodeGraphEvidence extends GitNexusEvidence {}

export interface CodeGraphProvider {
  getName(): string;
  isAvailable(): Promise<boolean>;
  getStatus(input: CodeGraphStatusInput): Promise<CodeGraphStatus>;
  analyzeRepo(input: CodeGraphAnalyzeInput): Promise<CodeGraphAnalyzeResult>;
  getImpact(input: CodeGraphImpactInput): Promise<GitNexusImpactReport>;
  collectEvidence(input: CodeGraphEvidenceInput): Promise<CodeGraphEvidence>;
}
