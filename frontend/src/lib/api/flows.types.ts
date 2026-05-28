/**
 * Pure type declarations for the Flows API client.
 *
 * Extracted from `flows.ts` (Wave 86 refactor) so that the runtime
 * module no longer carries ~165 LOC of pure shape definitions. Types
 * are inherently side-effect-free and unit-testable without mocking.
 *
 * `flows.ts` re-exports every symbol from this file, preserving the
 * public API surface — both direct consumers (`@/lib/api/flows`) and
 * the barrel (`@/lib/api`) remain wire-compatible.
 */

/** Flow primitive type. */
export type FlowPrimitive = string | number | boolean | null;

/** Flow json value type. */
export type FlowJsonValue =
  | FlowPrimitive
  | FlowJsonValue[]
  | { [key: string]: FlowJsonValue | undefined };

/** Flow node shape. */
export interface FlowNode {
  /** Id property. */
  id: string;
  /** Type property. */
  type?: string;
  /** Data property. */
  data?: Record<string, FlowJsonValue | undefined>;
  /** Position property. */
  position?: { x: number; y: number };
  [key: string]: FlowJsonValue | undefined | Record<string, FlowJsonValue | undefined>;
}

/** Flow edge shape. */
export interface FlowEdge {
  /** Id property. */
  id: string;
  /** Source property. */
  source: string;
  /** Target property. */
  target: string;
  /** Source handle property. */
  sourceHandle?: string | null;
  /** Target handle property. */
  targetHandle?: string | null;
  /** Label property. */
  label?: string;
  /** Type property. */
  type?: string;
  [key: string]: FlowJsonValue | undefined;
}

/** Flow shape. */
export interface Flow {
  /** Id property. */
  id: string;
  /** Name property. */
  name?: string;
  /** Description property. */
  description?: string;
  /** Is active property. */
  isActive?: boolean;
  /** Trigger type property. */
  triggerType?: string;
  /** Trigger condition property. */
  triggerCondition?: string;
  /** Nodes property. */
  nodes?: FlowNode[];
  /** Edges property. */
  edges?: FlowEdge[];
  /** Created at property. */
  createdAt?: string;
  /** Updated at property. */
  updatedAt?: string;
}

/** Flow log entry shape. */
export interface FlowLogEntry {
  /** Node id property. */
  nodeId?: string;
  /** Type property. */
  type?: string;
  /** Message property. */
  message?: string;
  /** Timestamp property. */
  timestamp?: string;
  /** Data property. */
  data?: Record<string, FlowJsonValue | undefined>;
}

/** Flow execution log shape. */
export interface FlowExecutionLog {
  /** Created at property. */
  createdAt: string;
  /** Logs property. */
  logs: FlowLogEntry[];
}

/** Flow execution status type. */
export type FlowExecutionStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'WAITING_INPUT';

/** Flow execution summary shape. */
export interface FlowExecutionSummary {
  /** Id property. */
  id: string;
  /** Status property. */
  status: FlowExecutionStatus | string;
  /** Current node id property. */
  currentNodeId?: string | null;
  /** State property. */
  state?: Record<string, FlowJsonValue | undefined> | null;
  /** Logs property. */
  logs?: FlowLogEntry[] | null;
  /** Contact property. */
  contact?: {
    name?: string | null;
    phone?: string | null;
  } | null;
  /** Flow property. */
  flow?: {
    name?: string | null;
  } | null;
  /** Created at property. */
  createdAt: string;
  /** Updated at property. */
  updatedAt: string;
}

/** Flow run result shape. */
export interface FlowRunResult {
  /** Execution id property. */
  executionId?: string;
  /** Status property. */
  status?: FlowExecutionStatus | string;
  /** State property. */
  state?: Record<string, FlowJsonValue | undefined>;
  /** Logs property. */
  logs?: FlowLogEntry[];
}

/** Flow version shape. */
export interface FlowVersion {
  /** Id property. */
  id: string;
  /** Flow id property. */
  flowId: string;
  /** Workspace id property. */
  workspaceId: string;
  /** Label property. */
  label?: string | null;
  /** Nodes property. */
  nodes: FlowNode[];
  /** Edges property. */
  edges: FlowEdge[];
  /** Created at property. */
  createdAt: string;
}

/** Flow optimize result shape. */
export interface FlowOptimizeResult {
  /** Suggestions property. */
  suggestions?: Array<{
    nodeId?: string;
    type?: string;
    message: string;
    severity?: 'info' | 'warning' | 'critical';
  }>;
  /** Improved flow property. */
  improvedFlow?: Pick<Flow, 'nodes' | 'edges'>;
}

/** Flow template shape. */
export interface FlowTemplate {
  /** Id property. */
  id: string;
  /** Name property. */
  name: string;
  /** Category property. */
  category: string;
  /** Description property. */
  description?: string;
  /** Is public property. */
  isPublic?: boolean;
  /** Nodes property. */
  nodes: FlowNode[];
  /** Edges property. */
  edges: FlowEdge[];
  /** Downloads property. */
  downloads?: number;
  /** Created at property. */
  createdAt?: string;
}
