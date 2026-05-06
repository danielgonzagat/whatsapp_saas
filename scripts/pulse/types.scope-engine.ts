// PULSE — Dynamic Universal Scope Engine types

export type ScopeFileStatus = 'classified' | 'unknown' | 'orphan' | 'excluded';

export type ScopeFileRole =
  | 'component'
  | 'page'
  | 'layout'
  | 'hook'
  | 'util'
  | 'lib'
  | 'service'
  | 'controller'
  | 'middleware'
  | 'guard'
  | 'interceptor'
  | 'decorator'
  | 'module'
  | 'provider'
  | 'resolver'
  | 'gateway'
  | 'worker'
  | 'queue_processor'
  | 'cron_job'
  | 'webhook_handler'
  | 'test'
  | 'fixture'
  | 'config'
  | 'type'
  | 'interface'
  | 'schema'
  | 'migration'
  | 'seed'
  | 'script'
  | 'asset'
  | 'style'
  | 'doc'
  | 'unknown';

export type ScopeExecutionMode =
  | 'ai_safe'
  | 'human_required'
  | 'observation_only'
  | 'not_executable';

export interface ScopeFileEntry {
  filePath: string;
  relativePath: string;
  extension: string;
  status: ScopeFileStatus;
  role: ScopeFileRole;
  isSource: boolean;
  isTest: boolean;
  isGenerated: boolean;
  isProtected: boolean;
  executionMode: ScopeExecutionMode;
  connections: string[];
  connectedFrom: string[];
  capabilityIds: string[];
  flowIds: string[];
  nodeIds: string[];
  firstSeen: string;
  lastModified: string;
  contentHash: string;
  classificationConfidence: number;
}

export interface ScopeEngineSummary {
  totalFiles: number;
  sourceFiles: number;
  testFiles: number;
  classifiedFiles: number;
  unknownFiles: number;
  orphanFiles: number;
  criticalOrphanFiles: number;
  protectedFiles: number;
  aiSafeFiles: number;
  humanRequiredFiles: number;
  observationOnlyFiles: number;
  notExecutableFiles: number;
  filesWithConnections: number;
  filesWithoutConnections: number;
}

export interface ScopeEngineState {
  generatedAt: string;
  rootDir: string;
  summary: ScopeEngineSummary;
  files: ScopeFileEntry[];
  newFilesSinceLastRun: string[];
  deletedFilesSinceLastRun: string[];
  modifiedFilesSinceLastRun: string[];
}
