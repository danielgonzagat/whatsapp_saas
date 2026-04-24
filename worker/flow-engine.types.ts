export type FlowNodeData = Record<string, unknown>;

export type FlowNode = {
  id: string;
  type: string;
  data?: FlowNodeData;
  next?: string | null;
  yes?: string | null;
  no?: string | null;
};

export type FlowDefinition = {
  id: string;
  name: string;
  nodes: Record<string, FlowNode>;
  startNode: string;
  workspaceId: string;
};

export type FlowVariables = Record<string, unknown>;

export type FlowLogEntry = {
  event?: string;
  nodeId?: string;
  nodeType?: string;
  type?: string;
  tool?: string;
  args?: unknown;
  result?: unknown;
  response?: string;
  kbUsed?: boolean;
  memoryUsed?: boolean;
  toolsUsed?: boolean;
  attempt?: number;
  message?: string;
  // Allow forward-compat metadata emitted by individual node handlers
  [key: string]: unknown;
};

export type PersistedFlowLogEntry = FlowLogEntry & {
  id: string;
  ts: number;
};

export type RawFlowNode = {
  id: string;
  type: string;
  data?: FlowNodeData;
};

export type RawFlowEdge = {
  source: string;
  target: string;
  sourceHandle?: string | null;
};

export type ExecutionState = {
  user: string;
  flowId: string;
  workspaceId: string;
  contactId?: string;
  nodeId: string;
  variables: FlowVariables;
  executionId?: string;
  logs?: PersistedFlowLogEntry[];
  waitingForResponse?: boolean;
  timeoutAt?: number;
  stack?: Array<{ flowId: string; nodeId: string }>;
};
