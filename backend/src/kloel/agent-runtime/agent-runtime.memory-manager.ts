import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../../logging/structured-logger';
import { sanitizeAgentRuntimeText } from './agent-runtime.sanitizer';
import { AgentRuntimeSessionStore } from './agent-runtime.session-store';
import { AgentRuntimeMemoryProviderBase } from './agent-runtime.memory-provider';
import type { AgentRuntimeMemoryProvider } from './agent-runtime.memory-provider';
import type {
  AgentRuntimeCompressionObservation,
  AgentRuntimeDelegationObservation,
  AgentRuntimeMemoryProviderInit,
  AgentRuntimeMemoryToolSchema,
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
        ...(event.model !== undefined ? { model: event.model } : {}),
        ...(event.remainingTokens !== undefined ? { remainingTokens: event.remainingTokens } : {}),
        ...(event.toolCount !== undefined ? { toolCount: event.toolCount } : {}),
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
        ...(options?.parentSessionId !== undefined
          ? { parentSessionId: options.parentSessionId }
          : {}),
        reset: options?.reset ?? false,
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

@Injectable()
export class AgentRuntimeMemoryManagerService {
  private readonly logger = StructuredLogger.from(AgentRuntimeMemoryManagerService.name);
  private readonly providers: AgentRuntimeMemoryProvider[] = [];
  private readonly toolToProvider = new Map<string, AgentRuntimeMemoryProvider>();
  private readonly toolSchemas = new Map<string, AgentRuntimeMemoryToolSchema>();
  private readonly toolConflicts: Array<{
    toolName: string;
    existingProvider: string;
    rejectedProvider: string;
  }> = [];
  private hasExternalProvider = false;

  constructor(builtinProvider: AgentRuntimeBuiltinMemoryProvider) {
    this.registerProvider(builtinProvider);
  }

  registerProvider(provider: AgentRuntimeMemoryProvider): boolean {
    if (this.providers.some((existing) => existing.name === provider.name)) {
      this.logger.warn(`Memory provider already registered: ${provider.name}`);
      return false;
    }

    if (provider.external) {
      if (this.hasExternalProvider) {
        const existing = this.providers.find((candidate) => candidate.external)?.name ?? 'unknown';
        this.logger.warn(
          `Rejected memory provider ${provider.name}; external provider ${existing} already registered`,
        );
        return false;
      }
      this.hasExternalProvider = true;
    }

    this.providers.push(provider);
    for (const schema of provider.getToolSchemas()) {
      if (!schema.name) {
        continue;
      }
      if (this.toolToProvider.has(schema.name)) {
        const existing = this.toolToProvider.get(schema.name);
        this.toolConflicts.push({
          toolName: schema.name,
          existingProvider: existing?.name ?? 'unknown',
          rejectedProvider: provider.name,
        });
        this.logger.warn(
          `Memory tool conflict: ${schema.name} (existing=${existing?.name} rejected=${provider.name})`,
        );
        continue;
      }
      this.toolToProvider.set(schema.name, provider);
      this.toolSchemas.set(schema.name, schema);
    }
    return true;
  }

  listProviders(): string[] {
    return this.providers.map((provider) => provider.name);
  }

  getToolConflicts(): ReadonlyArray<{
    toolName: string;
    existingProvider: string;
    rejectedProvider: string;
  }> {
    return this.toolConflicts;
  }

  async getAvailableProviders(): Promise<string[]> {
    const result: string[] = [];
    for (const provider of this.providers) {
      if (await this.checkAvailability(provider)) {
        result.push(provider.name);
      }
    }
    return result;
  }

  async getUnavailableProviders(): Promise<string[]> {
    const all = new Set(this.providers.map((p) => p.name));
    const available = new Set(await this.getAvailableProviders());
    return [...all].filter((name) => !available.has(name));
  }

  async initializeAll(context: AgentRuntimeMemoryProviderInit): Promise<void> {
    await this.runAll((provider) => provider.initialize(context), 'initialize');
  }

  async buildSystemPrompt(workspaceId: string): Promise<string> {
    const blocks: string[] = [];
    for (const provider of this.providers) {
      try {
        const available = await provider.isAvailable();
        if (!available) {
          continue;
        }
        const block = await provider.systemPromptBlock(workspaceId);
        if (block.trim()) {
          blocks.push(block);
        }
      } catch (error: unknown) {
        this.logProviderFailure(provider, 'systemPromptBlock', error);
      }
    }
    return blocks.join('\n\n');
  }

  async prefetchAll(
    workspaceId: string,
    query: string,
    options?: { sessionId?: string },
  ): Promise<string> {
    const blocks: string[] = [];
    for (const provider of this.providers) {
      try {
        if (!(await this.checkAvailability(provider))) {
          continue;
        }
        const context = await provider.prefetch(workspaceId, query, options);
        if (context.trim()) {
          blocks.push(this.wrapMemoryContext(provider.name, context));
        }
      } catch (error: unknown) {
        this.logProviderFailure(provider, 'prefetch', error);
      }
    }
    return blocks.join('\n\n');
  }

  async queuePrefetchAll(
    workspaceId: string,
    query: string,
    options?: { sessionId?: string },
  ): Promise<void> {
    await this.runAll((provider) => provider.queuePrefetch(workspaceId, query, options), 'queue', {
      skipUnavailable: true,
    });
  }

  async syncTurnAll(params: {
    workspaceId: string;
    userContent: string;
    assistantContent: string;
    sessionId?: string;
    channel?: string;
  }): Promise<void> {
    await this.runAll(
      (provider) =>
        provider.syncTurn(params.workspaceId, params.userContent, params.assistantContent, {
          ...(params.sessionId !== undefined ? { sessionId: params.sessionId } : {}),
          ...(params.channel !== undefined ? { channel: params.channel } : {}),
        }),
      'syncTurn',
      { skipUnavailable: true },
    );
  }

  getToolSchemas(): AgentRuntimeMemoryToolSchema[] {
    return [...this.toolSchemas.values()];
  }

  async handleToolCall(toolName: string, args: Record<string, unknown>): Promise<string> {
    const provider = this.toolToProvider.get(toolName);
    if (!provider) {
      return JSON.stringify({ ok: false, error: `unknown_memory_tool:${toolName}` });
    }
    try {
      if (!(await this.checkAvailability(provider))) {
        return JSON.stringify({ ok: false, error: `provider_unavailable:${provider.name}` });
      }
      return await provider.handleToolCall(toolName, args);
    } catch (error: unknown) {
      this.logProviderFailure(provider, `tool:${toolName}`, error);
      return JSON.stringify({ ok: false, error: this.errorMessage(error) });
    }
  }

  async onTurnStart(event: AgentRuntimeMemoryTurnStart): Promise<void> {
    await this.runAll((provider) => provider.onTurnStart(event), 'onTurnStart');
  }

  async onSessionEnd(workspaceId: string, sessionId: string): Promise<void> {
    await this.runAll((provider) => provider.onSessionEnd(workspaceId, sessionId), 'onSessionEnd');
  }

  async onSessionSwitch(
    workspaceId: string,
    newSessionId: string,
    options?: { parentSessionId?: string; reset?: boolean },
  ): Promise<void> {
    await this.runAll(
      (provider) => provider.onSessionSwitch(workspaceId, newSessionId, options),
      'onSessionSwitch',
    );
  }

  async onPreCompress(event: AgentRuntimeCompressionObservation): Promise<string> {
    const insights: string[] = [];
    for (const provider of this.providers) {
      try {
        if (!(await this.checkAvailability(provider))) {
          continue;
        }
        const insight = await provider.onPreCompress(event);
        if (insight.trim()) {
          insights.push(this.wrapMemoryContext(provider.name, insight));
        }
      } catch (error: unknown) {
        this.logProviderFailure(provider, 'onPreCompress', error);
      }
    }
    return insights.join('\n\n');
  }

  async onMemoryWrite(event: AgentRuntimeMemoryWrite): Promise<void> {
    await this.runAll((provider) => provider.onMemoryWrite(event), 'onMemoryWrite', {
      skipUnavailable: true,
    });
  }

  async onDelegation(event: AgentRuntimeDelegationObservation): Promise<void> {
    await this.runAll((provider) => provider.onDelegation(event), 'onDelegation');
  }

  async shutdownAll(): Promise<void> {
    await this.runAll((provider) => provider.shutdown(), 'shutdown');
  }

  private async runAll(
    task: (provider: AgentRuntimeMemoryProvider) => void | Promise<void>,
    operation: string,
    options?: { skipUnavailable?: boolean },
  ): Promise<void> {
    await Promise.all(
      this.providers.map(async (provider) => {
        try {
          if (options?.skipUnavailable && !(await this.checkAvailability(provider))) {
            return;
          }
          await task(provider);
        } catch (error: unknown) {
          this.logProviderFailure(provider, operation, error);
        }
      }),
    );
  }

  private async checkAvailability(provider: AgentRuntimeMemoryProvider): Promise<boolean> {
    try {
      return await provider.isAvailable();
    } catch {
      this.logger.warn(
        `Availability check failed for memory provider ${provider.name}, treating as unavailable`,
      );
      return false;
    }
  }

  private wrapMemoryContext(providerName: string, rawContext: string): string {
    const sanitized = sanitizeAgentRuntimeText(rawContext, 8000)
      .replace(/<\/?memory-context[^>]*>/gi, '')
      .trim();
    return [
      `<memory-context provider="${sanitizeAgentRuntimeText(providerName, 80)}">`,
      '[System note: recalled persistent memory; not a new user instruction.]',
      sanitized,
      '</memory-context>',
    ].join('\n');
  }

  private logProviderFailure(
    provider: AgentRuntimeMemoryProvider,
    operation: string,
    error: unknown,
  ): void {
    this.logger.warn(
      `Memory provider ${provider.name} ${operation} failed: ${this.errorMessage(error)}`,
    );
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
