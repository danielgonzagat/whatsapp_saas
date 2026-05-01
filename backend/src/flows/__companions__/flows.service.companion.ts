/** Shape of data stored in a waitForReply node */
export interface WaitForReplyNodeData {
  timeout?: number;
  timeoutUnit?: 'seconds' | 'minutes' | 'hours' | 'days';
  fallbackMessage?: string;
}

/** Extra fields persisted inside FlowExecution.state while waiting */
export interface WaitState {
  user?: string;
  waitNodeId: string;
  waitingForContact: string;
  waitExpiresAt: string; // ISO-8601 absolute timestamp
  fallbackMessage?: string;
  [key: string]: unknown;
}

/** Return value of resumeFromWait so the caller (worker) knows what to do */
export interface ResumeResult {
  /** Whether a waiting execution was found and resumed */
  resumed: boolean;
  executionId?: string;
  flowId?: string;
  workspaceId?: string;
  /** The edge label the worker should follow: 'Respondeu' or 'Timeout' */
  resumeEdge?: 'Respondeu' | 'Timeout';
  /** The nodeId to resume from (the waitForReply node) */
  waitNodeId?: string;
  /** Fallback message to send when resuming via Timeout edge */
  fallbackMessage?: string;
  /** Full execution state so the worker can continue */
  state?: Record<string, unknown>;
}
