export type PulseCommandPurpose =
  | 'install'
  | 'build'
  | 'test'
  | 'dev'
  | 'pulse'
  | 'typecheck'
  | 'lint'
  | 'deploy'
  | 'other';

export type PulseCommandSourceKind =
  | 'package-json'
  | 'lockfile'
  | 'tsconfig'
  | 'dockerfile'
  | 'github-workflow';

export interface PulseDiscoveredCommand {
  id: string;
  purpose: PulseCommandPurpose;
  command: string;
  sourcePath: string;
  sourceKind: PulseCommandSourceKind;
  packagePath?: string;
  scriptName?: string;
  confidence: 'high' | 'medium' | 'low';
  signals: string[];
}

export interface PulseDiscoveredEnvironmentVariable {
  name: string;
  sourcePath: string;
  sourceKind: PulseCommandSourceKind;
  contexts: string[];
  required: boolean;
  secretLike: boolean;
}

export interface PulseCommandGraph {
  generatedAt: string;
  commands: PulseDiscoveredCommand[];
  environmentVariables: PulseDiscoveredEnvironmentVariable[];
  scannedSources: string[];
}

export interface PackageJson {
  scripts?: Record<string, unknown>;
}

export interface CandidateSource {
  relativePath: string;
  sourceKind: PulseCommandSourceKind;
}
