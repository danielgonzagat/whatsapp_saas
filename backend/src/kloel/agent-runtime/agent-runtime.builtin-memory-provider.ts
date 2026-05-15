import { Injectable } from '@nestjs/common';
import { AgentRuntimeMemoryProviderBase } from './agent-runtime.memory-provider';
import { sanitizeAgentRuntimeText } from './agent-runtime.sanitizer';
import { AgentRuntimeSessionStore } from './agent-runtime.session-store';
import type {
  AgentRuntimeCompressionObservation,
  AgentRuntimeDelegationObservation,
  AgentRuntimeMemoryTurnStart,
  AgentRuntimeMemoryWrite,
} from './agent-runtime.types';

@Injectable()
export class AgentRuntimeBuiltinMemoryProvider extends AgentRuntimeMemoryProviderBase {
  readonly name = 'builtin';
  override readonly external = false;

  constructor(private readonly sessions: AgentRuntimeSessionStore) {
    super();
  }

  override systemPromptBlock(): string {
    return [
      '<kloel-memory-provider name="builtin">',
      'status=available',
      'scope=workspace_session_recall',
      'truth=observed_kloel_memory_rows',
      '</kloel-memory-provider>',
    ].join('\n');
  }

  override async prefetch(workspaceId: string, query: string): Promise<string> {
    const recall = await this.sessions.search(workspaceId, query, 6);
    if (recall.memories.length === 0) {
      return '';
    }
    const lines = recall.memories.map((memory) =>
      [
        `- [${memory.category}] ${sanitizeAgentRuntimeText(memory.content, 500)}`,
        `source=${memory.source.source}`,
        `truth=${memory.source.truthMode}`,
        `confidence=${memory.source.confidence}`,
        `freshness=${memory.source.freshness}`,
      ].join(' '),
    );
    return ['<memory-context provider="builtin">', ...lines, '</memory-context>'].join('\n');
  }

  override async syncTurn(
    workspaceId: string,
    userContent: string,
    assistantContent: string,
    options?: { sessionId?: string; channel?: string },
  ): Promise<void> {
    await this.sessions.recordTurn({
      workspaceId,
      channel: options?.channel ?? 'agent-runtime',
      userMessage: userContent,
      assistantMessage: assistantContent,
      ...(options?.sessionId !== undefined ? { threadId: options.sessionId } : {}),
    });
  }

  override async onTurnStart(event: AgentRuntimeMemoryTurnStart): Promise<void> {
    await this.sessions.recordRuntimeEvent({
      workspaceId: event.workspaceId,
      sessionId: event.sessionId,
      eventType: 'turn_start',
      content: `turn=${event.turnNumber}\nchannel=${event.channel}\nmessage=${sanitizeAgentRuntimeText(event.message, 1200)}`,
      metadata: {
        channel: event.channel,
        model: event.model,
        remainingTokens: event.remainingTokens,
        toolCount: event.toolCount,
      },
    });
  }

  override async onSessionEnd(workspaceId: string, sessionId: string): Promise<void> {
    await this.sessions.recordRuntimeEvent({
      workspaceId,
      sessionId,
      eventType: 'session_end',
      content: `session ended: ${sanitizeAgentRuntimeText(sessionId, 160)}`,
    });
  }

  override async onSessionSwitch(
    workspaceId: string,
    newSessionId: string,
    options?: { parentSessionId?: string; reset?: boolean },
  ): Promise<void> {
    await this.sessions.recordRuntimeEvent({
      workspaceId,
      sessionId: newSessionId,
      eventType: 'session_switch',
      content: `session=${sanitizeAgentRuntimeText(newSessionId, 160)} parent=${sanitizeAgentRuntimeText(options?.parentSessionId ?? '', 160)}`,
      metadata: {
        reset: options?.reset ?? false,
        ...(options?.parentSessionId !== undefined
          ? { parentSessionId: options.parentSessionId }
          : {}),
      },
    });
  }

  override async onPreCompress(event: AgentRuntimeCompressionObservation): Promise<string> {
    const content = event.messages
      .slice(-8)
      .map((message) => `${message.role}: ${sanitizeAgentRuntimeText(message.content, 500)}`)
      .join('\n');
    await this.sessions.recordRuntimeEvent({
      workspaceId: event.workspaceId,
      sessionId: event.sessionId,
      eventType: 'pre_compress',
      content,
      metadata: { messageCount: event.messages.length },
    });
    return content ? `<provider-insight name="builtin">\n${content}\n</provider-insight>` : '';
  }

  override async onMemoryWrite(event: AgentRuntimeMemoryWrite): Promise<void> {
    await this.sessions.recordRuntimeEvent({
      workspaceId: event.workspaceId,
      sessionId: event.sessionId,
      eventType: 'memory_write',
      content: `${event.action}:${event.target}\n${sanitizeAgentRuntimeText(event.content, 2000)}`,
      ...(event.metadata !== undefined ? { metadata: event.metadata } : {}),
    });
  }

  override async onDelegation(event: AgentRuntimeDelegationObservation): Promise<void> {
    await this.sessions.recordRuntimeEvent({
      workspaceId: event.workspaceId,
      sessionId: event.sessionId,
      eventType: 'delegation',
      content: [
        `childSessionId=${sanitizeAgentRuntimeText(event.childSessionId ?? '', 160)}`,
        `task: ${sanitizeAgentRuntimeText(event.task, 2000)}`,
        `result: ${sanitizeAgentRuntimeText(event.result, 3000)}`,
      ].join('\n'),
      ...(event.metadata !== undefined ? { metadata: event.metadata } : {}),
    });
  }
}
