// PULSE — Live Codebase Nervous System
// Universal Code Behavior Graph types — per-function analysis

export type BehaviorNodeKind =
  | 'function_definition'
  | 'method_definition'
  | 'handler'
  | 'api_endpoint'
  | 'queue_consumer'
  | 'queue_producer'
  | 'cron_job'
  | 'webhook_receiver'
  | 'event_emitter'
  | 'event_listener'
  | 'db_reader'
  | 'db_writer'
  | 'external_api_call'
  | 'file_io'
  | 'auth_check'
  | 'validation'
  | 'transformation'
  | 'side_effect'
  | 'ui_action'
  | 'lifecycle_hook';

export type BehaviorInputKind =
  | 'body'
  | 'query'
  | 'params'
  | 'headers'
  | 'context'
  | 'env'
  | 'db'
  | 'cache'
  | 'message';

export type BehaviorOutputKind =
  | 'response'
  | 'db_write'
  | 'cache_write'
  | 'event'
  | 'queue_message'
  | 'file'
  | 'log'
  | 'error';

export type BehaviorRiskLevel = 'critical' | 'high' | 'medium' | 'low' | 'none';

export interface BehaviorInput {
  kind: BehaviorInputKind;
  name: string;
  type: string;
  required: boolean;
  validated: boolean;
  source: string;
}

export interface BehaviorOutput {
  kind: BehaviorOutputKind;
  target: string;
  type: string;
  conditional: boolean;
}

export interface BehaviorStateAccess {
  model: string;
  operation: 'create' | 'read' | 'update' | 'delete' | 'upsert';
  fieldPaths: string[];
  whereClause: string | null;
}

export interface BehaviorExternalCall {
  provider: string;
  operation: string;
  hasTimeout: boolean;
  hasRetry: boolean;
  hasCircuitBreaker: boolean;
  hasFallback: boolean;
}

export interface BehaviorNode {
  id: string;
  kind: BehaviorNodeKind;
  name: string;
  filePath: string;
  line: number;
  parentFunctionId: string | null;
  inputs: BehaviorInput[];
  outputs: BehaviorOutput[];
  stateAccess: BehaviorStateAccess[];
  externalCalls: BehaviorExternalCall[];
  risk: BehaviorRiskLevel;
  executionMode: 'ai_safe' | 'human_required' | 'observation_only';
  calledBy: string[];
  calls: string[];
  isAsync: boolean;
  hasErrorHandler: boolean;
  hasLogging: boolean;
  hasMetrics: boolean;
  hasTracing: boolean;
  decorators: string[];
  docComment: string | null;
}

export interface BehaviorGraphSummary {
  totalNodes: number;
  handlerNodes: number;
  apiEndpointNodes: number;
  queueNodes: number;
  cronNodes: number;
  webhookNodes: number;
  dbNodes: number;
  externalCallNodes: number;
  aiSafeNodes: number;
  humanRequiredNodes: number;
  nodesWithErrorHandler: number;
  nodesWithLogging: number;
  nodesWithMetrics: number;
  criticalRiskNodes: number;
}

export interface BehaviorGraph {
  generatedAt: string;
  summary: BehaviorGraphSummary;
  nodes: BehaviorNode[];
  orphanNodes: string[];
  unreachableNodes: string[];
}
