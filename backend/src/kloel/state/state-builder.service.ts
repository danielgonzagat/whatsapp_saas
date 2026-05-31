import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../../logging/structured-logger';
import { PrismaService } from '../../prisma/prisma.service';
import { CapabilityRegistryV2Service } from '../capability-registry-v2/capability-registry-v2.service';
import { MindMessageService } from '../mind/aliases/mind-message.service';
import type {
  BuildConversationStateInput,
  ConversationActorState,
  ConversationContactState,
  ConversationEventState,
  ConversationMemoryTurn,
  ConversationState,
  ConversationWorkspaceState,
} from './conversation-state.types';

const DEFAULT_MEMORY_LIMIT = 20;
const DEFAULT_EVENT_LIMIT = 50;
const EVENT_LOOKBACK_MS = 24 * 60 * 60 * 1000;

/**
 * StateBuilder — assembles a {@link ConversationState} per turn from REAL
 * production sources. No fakes, no persona, no Math.random. Each field is
 * sourced from a concrete Prisma model / registry service; when a source
 * cannot be honestly resolved it is reported in `missingSources` rather
 * than fabricated.
 *
 * The think path verbalizes this State via the LLM (Y-4 / X §2.6/3.4):
 * the model describes the real State, it does not invent it.
 */
@Injectable()
export class StateBuilderService {
  private readonly logger = StructuredLogger.from(StateBuilderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly capabilities: CapabilityRegistryV2Service,
    private readonly mindMessage: MindMessageService,
  ) {}

  /** Assemble the per-turn ConversationState from real data sources. */
  async build(input: BuildConversationStateInput): Promise<ConversationState> {
    const missingSources: string[] = [];
    const memoryLimit = input.memoryLimit ?? DEFAULT_MEMORY_LIMIT;
    const eventLimit = input.eventLimit ?? DEFAULT_EVENT_LIMIT;

    const [workspace, actor, contact, recentEvents, shortTerm] = await Promise.all([
      this.resolveWorkspace(input, missingSources),
      this.resolveActor(input, missingSources),
      this.resolveContact(input, missingSources),
      this.resolveRecentEvents(input.workspaceId, eventLimit, missingSources),
      this.resolveShortTermMemory(input.workspaceId, memoryLimit, missingSources),
    ]);

    const capabilities = this.resolveCapabilities(input);

    // No per-workspace RiskService exists yet: RiscEvent is a global
    // Google-RISC security feed (no workspaceId), not per-conversation
    // risk. Report it honestly instead of faking a posture.
    missingSources.push('risk:no-per-workspace-risk-service');

    return {
      workspace,
      actor,
      contact,
      recentEvents,
      memory: { shortTerm },
      capabilities,
      risk: {
        available: false,
        reason: 'No per-workspace RiskService; RiscEvent is a global RISC feed.',
      },
      missingSources,
      assembledAt: new Date(),
    };
  }

  private async resolveWorkspace(
    input: BuildConversationStateInput,
    missing: string[],
  ): Promise<ConversationWorkspaceState | null> {
    if (!input.workspaceId) {
      missing.push('workspace:no-workspaceId');
      return null;
    }
    try {
      const row = await this.prisma.workspace.findUnique({
        where: { id: input.workspaceId },
        select: { id: true, name: true },
      });
      if (!row) {
        missing.push('workspace:not-found');
        return null;
      }
      return { id: row.id, name: row.name, context: input.workspaceContext ?? '' };
    } catch (error: unknown) {
      this.logger.warn('StateBuilder: failed to resolve workspace', error);
      missing.push('workspace:error');
      return null;
    }
  }

  private async resolveActor(
    input: BuildConversationStateInput,
    missing: string[],
  ): Promise<ConversationActorState | null> {
    if (!input.userId || !input.workspaceId) {
      missing.push('actor:no-userId');
      return null;
    }
    try {
      const row = await this.prisma.agent.findFirst({
        where: { id: input.userId, workspaceId: input.workspaceId },
        select: { id: true, name: true, role: true },
      });
      if (!row) {
        missing.push('actor:not-found');
        return null;
      }
      return { id: row.id, name: row.name, role: row.role };
    } catch (error: unknown) {
      this.logger.warn('StateBuilder: failed to resolve actor', error);
      missing.push('actor:error');
      return null;
    }
  }

  private async resolveContact(
    input: BuildConversationStateInput,
    missing: string[],
  ): Promise<ConversationContactState | null> {
    if (!input.workspaceId || !input.contactPhone) {
      // Contact is only relevant for lead-bound turns; absence is normal.
      return null;
    }
    try {
      const row = await this.prisma.contact.findFirst({
        where: { workspaceId: input.workspaceId, phone: input.contactPhone },
        select: {
          id: true,
          name: true,
          phone: true,
          leadScore: true,
          sentiment: true,
          purchaseProbability: true,
        },
      });
      if (!row) {
        missing.push('contact:not-found');
        return null;
      }
      return {
        id: row.id,
        name: row.name,
        phone: row.phone,
        leadScore: row.leadScore,
        sentiment: row.sentiment,
        purchaseProbability: row.purchaseProbability,
      };
    } catch (error: unknown) {
      this.logger.warn('StateBuilder: failed to resolve contact', error);
      missing.push('contact:error');
      return null;
    }
  }

  private async resolveRecentEvents(
    workspaceId: string | undefined,
    limit: number,
    missing: string[],
  ): Promise<ConversationEventState[]> {
    if (!workspaceId) {
      missing.push('recentEvents:no-workspaceId');
      return [];
    }
    try {
      const since = new Date(Date.now() - EVENT_LOOKBACK_MS);
      const rows = await this.prisma.auditLog.findMany({
        where: { workspaceId, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { action: true, resource: true, resourceId: true, createdAt: true },
      });
      return rows.map((row) => ({
        action: row.action,
        resource: row.resource,
        resourceId: row.resourceId,
        createdAt: row.createdAt,
      }));
    } catch (error: unknown) {
      this.logger.warn('StateBuilder: failed to resolve recent events', error);
      missing.push('recentEvents:error');
      return [];
    }
  }

  private async resolveShortTermMemory(
    workspaceId: string | undefined,
    limit: number,
    missing: string[],
  ): Promise<ConversationMemoryTurn[]> {
    if (!workspaceId) {
      missing.push('memory:no-workspaceId');
      return [];
    }
    try {
      const rows = await this.mindMessage.items.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { role: true, content: true, createdAt: true },
      });
      // Return chronological (oldest first) for prompt assembly.
      return rows
        .map((row) => ({ role: row.role, content: row.content, createdAt: row.createdAt }))
        .reverse();
    } catch (error: unknown) {
      this.logger.warn('StateBuilder: failed to resolve short-term memory', error);
      missing.push('memory:error');
      return [];
    }
  }

  private resolveCapabilities(input: BuildConversationStateInput) {
    return this.capabilities.filterFor({
      surface: input.surface ?? 'chat',
      permissions: input.permissions ?? [],
    });
  }
}
