import type { ContextStore } from '../context-store';
import type { FlowVariables } from '../flow-engine.types';
import type { WorkerLogger } from '../logger';

export type FlowNodeResult = string | 'WAIT' | 'END';

export interface FlowNodeExecutorDeps {
  sendMessage: (user: string, text: string, workspaceId?: string) => Promise<unknown>;
  context: ContextStore;
  log: WorkerLogger;
  timeoutMember: (user: string, workspaceId?: string) => string;
  sleep: (ms: number) => Promise<void>;
  evaluate: (expr: string, vars: FlowVariables) => boolean;
}
