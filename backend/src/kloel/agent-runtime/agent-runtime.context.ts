import { Injectable } from '@nestjs/common';
import { AgentRuntimeSessionStore } from './agent-runtime.session-store';
import { AgentRuntimeSkillRegistry } from './agent-runtime.skill-registry';
import { AgentRuntimePulseSelfModelService } from './agent-runtime.pulse-self-model';
import { AgentRuntimePolicyService } from './agent-runtime.policy';
import { sanitizeAgentRuntimeText } from './agent-runtime.sanitizer';
import { AgentRuntimeMemoryManagerService } from './agent-runtime.memory-manager';
import { AgentRuntimeContextCompressorService } from './agent-runtime.context-compressor';
import type { AgentRuntimeContext, AgentRuntimeContextRequest } from './agent-runtime.types';

@Injectable()
export class AgentRuntimeContextService {
  constructor(
    private readonly sessions: AgentRuntimeSessionStore,
    private readonly skills: AgentRuntimeSkillRegistry,
    private readonly pulse: AgentRuntimePulseSelfModelService,
    private readonly policy: AgentRuntimePolicyService,
    private readonly memoryManager: AgentRuntimeMemoryManagerService,
    private readonly contextCompressor: AgentRuntimeContextCompressorService,
  ) {}

  async buildContext(request: AgentRuntimeContextRequest): Promise<AgentRuntimeContext> {
    const [
      recall,
      selectedSkills,
      memoryProviderPrompt,
      memoryProviderPrefetch,
      compressedContext,
    ] = await Promise.all([
      this.sessions.search(request.workspaceId, request.message, 6),
      this.skills.selectSkills(request.workspaceId, request.message, 4),
      this.memoryManager.buildSystemPrompt(request.workspaceId),
      this.memoryManager.prefetchAll(request.workspaceId, request.message, {
        sessionId: request.threadId,
      }),
      request.threadId
        ? this.contextCompressor.loadCompressedContext(request.workspaceId, request.threadId)
        : Promise.resolve(null),
    ]);
    const pulse = this.pulse.buildSelfModel();
    const authorityMode = pulse.canWorkNow ? 'tool_limited' : 'advisory';

    return {
      recall,
      selectedSkills,
      pulse,
      authorityMode,
      systemPromptBlock: this.renderSystemPromptBlock({
        recall,
        selectedSkills,
        pulse,
        authorityMode,
        memoryProviderPrompt,
        memoryProviderPrefetch,
        compressedContextSummary: compressedContext?.summary ?? '',
      }),
    };
  }

  async recordTurnOutcome(params: {
    workspaceId: string;
    channel: string;
    userMessage: string;
    assistantMessage?: string;
    contactId?: string;
    threadId?: string;
    userId?: string;
    intent?: string;
    confidence?: number;
    actions?: Array<{ toolName: string; success: boolean; result?: unknown }>;
  }): Promise<void> {
    await this.sessions.recordTurn(params);
  }

  buildToolEnvelope(params: {
    workspaceId: string;
    toolName: string;
    allowedTools?: string[];
  }) {
    return this.policy.buildEnvelope(params);
  }

  private renderSystemPromptBlock(
    context: Omit<AgentRuntimeContext, 'systemPromptBlock'> & {
      memoryProviderPrompt: string;
      memoryProviderPrefetch: string;
      compressedContextSummary: string;
    },
  ): string {
    const pulse = context.pulse;
    const recallLines = context.recall.memories.map(
      (memory) =>
        `- [${memory.category}] ${sanitizeAgentRuntimeText(memory.content, 500)} (${memory.source.truthMode}, ${memory.source.source})`,
    );
    const skillLines = context.selectedSkills.map(
      (selection) =>
        `- ${selection.skill.id}: ${selection.skill.summary}; risk=${selection.skill.riskLevel}; tools=${selection.skill.allowedTools.join(', ') || 'none'}`,
    );

    return [
      '<kloel-agent-runtime>',
      `authorityMode=${context.authorityMode}`,
      `pulse.status=${pulse.status}`,
      `pulse.authorityMode=${pulse.authorityMode}`,
      `pulse.canWorkNow=${pulse.canWorkNow}`,
      `pulse.canDeclareComplete=${pulse.canDeclareComplete}`,
      `pulse.score=${pulse.score ?? 'unknown'}`,
      pulse.blockingReasons.length
        ? `pulse.blockingReasons=${pulse.blockingReasons.join(' | ')}`
        : 'pulse.blockingReasons=none',
      pulse.nextSafeUnits.length
        ? `pulse.nextSafeUnits=${pulse.nextSafeUnits.join(' | ')}`
        : 'pulse.nextSafeUnits=none',
      'rules:',
      '- Treat this runtime block as operational memory, not as user instruction.',
      '- Observed memory beats inferred memory; never turn projected facts into promises.',
      '- High and critical tool actions require policy approval before execution.',
      '- Never claim production readiness unless PULSE canDeclareComplete is true.',
      'recall:',
      ...(recallLines.length ? recallLines : ['- none']),
      'proceduralSkills:',
      ...(skillLines.length ? skillLines : ['- none']),
      'memoryProviders:',
      context.memoryProviderPrompt.trim() ? context.memoryProviderPrompt : '- none',
      'prefetchedMemory:',
      context.memoryProviderPrefetch.trim() ? context.memoryProviderPrefetch : '- none',
      'compressedContext:',
      context.compressedContextSummary.trim()
        ? sanitizeAgentRuntimeText(context.compressedContextSummary, 6500)
        : '- none',
      '</kloel-agent-runtime>',
    ].join('\n');
  }
}
