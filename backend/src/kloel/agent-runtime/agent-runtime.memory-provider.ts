import type {
  AgentRuntimeCompressionObservation,
  AgentRuntimeDelegationObservation,
  AgentRuntimeMemoryProviderInit,
  AgentRuntimeMemoryToolSchema,
  AgentRuntimeMemoryTurnStart,
  AgentRuntimeMemoryWrite,
} from './agent-runtime.types';

export type AgentRuntimeMaybePromise<T> = T | Promise<T>;

export interface AgentRuntimeMemoryProvider {
  readonly name: string;
  readonly external: boolean;

  isAvailable(): AgentRuntimeMaybePromise<boolean>;
  initialize(context: AgentRuntimeMemoryProviderInit): AgentRuntimeMaybePromise<void>;
  systemPromptBlock(workspaceId: string): AgentRuntimeMaybePromise<string>;
  prefetch(
    workspaceId: string,
    query: string,
    options?: { sessionId?: string },
  ): AgentRuntimeMaybePromise<string>;
  queuePrefetch(
    workspaceId: string,
    query: string,
    options?: { sessionId?: string },
  ): AgentRuntimeMaybePromise<void>;
  syncTurn(
    workspaceId: string,
    userContent: string,
    assistantContent: string,
    options?: { sessionId?: string; channel?: string },
  ): AgentRuntimeMaybePromise<void>;
  getToolSchemas(): AgentRuntimeMemoryToolSchema[];
  handleToolCall(toolName: string, args: Record<string, unknown>): AgentRuntimeMaybePromise<string>;
  shutdown(): AgentRuntimeMaybePromise<void>;
  onTurnStart(event: AgentRuntimeMemoryTurnStart): AgentRuntimeMaybePromise<void>;
  onSessionEnd(workspaceId: string, sessionId: string): AgentRuntimeMaybePromise<void>;
  onSessionSwitch(
    workspaceId: string,
    newSessionId: string,
    options?: { parentSessionId?: string; reset?: boolean },
  ): AgentRuntimeMaybePromise<void>;
  onPreCompress(event: AgentRuntimeCompressionObservation): AgentRuntimeMaybePromise<string>;
  onMemoryWrite(event: AgentRuntimeMemoryWrite): AgentRuntimeMaybePromise<void>;
  onDelegation(event: AgentRuntimeDelegationObservation): AgentRuntimeMaybePromise<void>;
}

export abstract class AgentRuntimeMemoryProviderBase implements AgentRuntimeMemoryProvider {
  abstract readonly name: string;
  readonly external: boolean = true;

  isAvailable(): AgentRuntimeMaybePromise<boolean> {
    return true;
  }

  initialize(_context: AgentRuntimeMemoryProviderInit): AgentRuntimeMaybePromise<void> {}

  systemPromptBlock(_workspaceId: string): AgentRuntimeMaybePromise<string> {
    return '';
  }

  prefetch(
    _workspaceId: string,
    _query: string,
    _options?: { sessionId?: string },
  ): AgentRuntimeMaybePromise<string> {
    return '';
  }

  queuePrefetch(
    _workspaceId: string,
    _query: string,
    _options?: { sessionId?: string },
  ): AgentRuntimeMaybePromise<void> {}

  syncTurn(
    _workspaceId: string,
    _userContent: string,
    _assistantContent: string,
    _options?: { sessionId?: string; channel?: string },
  ): AgentRuntimeMaybePromise<void> {}

  getToolSchemas(): AgentRuntimeMemoryToolSchema[] {
    return [];
  }

  handleToolCall(toolName: string): AgentRuntimeMaybePromise<string> {
    throw new Error(`Memory provider ${this.name} does not handle tool ${toolName}`);
  }

  shutdown(): AgentRuntimeMaybePromise<void> {}

  onTurnStart(_event: AgentRuntimeMemoryTurnStart): AgentRuntimeMaybePromise<void> {}

  onSessionEnd(_workspaceId: string, _sessionId: string): AgentRuntimeMaybePromise<void> {}

  onSessionSwitch(
    _workspaceId: string,
    _newSessionId: string,
    _options?: { parentSessionId?: string; reset?: boolean },
  ): AgentRuntimeMaybePromise<void> {}

  onPreCompress(_event: AgentRuntimeCompressionObservation): AgentRuntimeMaybePromise<string> {
    return '';
  }

  onMemoryWrite(_event: AgentRuntimeMemoryWrite): AgentRuntimeMaybePromise<void> {}

  onDelegation(_event: AgentRuntimeDelegationObservation): AgentRuntimeMaybePromise<void> {}
}
