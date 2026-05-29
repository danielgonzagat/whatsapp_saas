import { Injectable, NotFoundException } from '@nestjs/common';
import { StructuredLogger } from '../../logging/structured-logger';
import { PrismaService } from '../../prisma/prisma.service';

export interface AgentJobCreateArgs {
  name?: string;
  title?: string;
  schedule?: string;
  action?: string;
  kind?: string;
  entityType?: string;
  entityId?: string;
  [key: string]: unknown;
}

export interface AgentJobListArgs {
  state?: string;
  kind?: string;
  limit?: number;
  [key: string]: unknown;
}

export interface AgentJobSetEnabledArgs {
  jobId?: string;
  id?: string;
  enabled?: boolean;
  [key: string]: unknown;
}

/**
 * AgentJobService — wraps AgentWorkItem CRUD for capability resolution.
 *
 * domainService aliases:
 *   - AgentJobService.create
 *   - AgentJobService.list
 *   - AgentJobService.setEnabled
 *
 * AgentWorkItem is the canonical model for scheduled / agentic work items.
 * Workspace isolation enforced on every operation.
 */
@Injectable()
export class AgentJobService {
  private readonly logger = StructuredLogger.from(AgentJobService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Create a new agent job (AgentWorkItem). */
  async create(
    workspaceId: string,
    args: AgentJobCreateArgs,
  ): Promise<{ success: boolean; data: unknown }> {
    const title = String(args.title ?? args.name ?? '').trim();
    if (!title) {
      return { success: false, data: { error: 'title_required' } };
    }

    const kind = String(args.kind ?? 'scheduled').trim();
    const entityType = String(args.entityType ?? args.action ?? 'generic').trim();
    const entityId = typeof args.entityId === 'string' ? args.entityId : undefined;

    const item = await this.prisma.agentWorkItem.create({
      data: {
        workspaceId,
        kind,
        entityType,
        entityId,
        title,
        summary: typeof args.schedule === 'string' ? args.schedule : undefined,
        state: 'OPEN',
        owner: 'AGENT',
      },
    });

    this.logger.log(
      `AgentJobService.create ws=${workspaceId} id=${item.id} kind=${kind}`,
    );
    return { success: true, data: item };
  }

  /** List agent jobs for the workspace. */
  async list(
    workspaceId: string,
    args: AgentJobListArgs = {},
  ): Promise<{ success: boolean; data: unknown }> {
    const limit = Math.min(Number(args.limit ?? 100), 500);
    const where: Record<string, unknown> = { workspaceId };
    if (typeof args.state === 'string') {
      where.state = args.state;
    }
    if (typeof args.kind === 'string') {
      where.kind = args.kind;
    }

    const items = await this.prisma.agentWorkItem.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        kind: true,
        entityType: true,
        entityId: true,
        state: true,
        title: true,
        summary: true,
        priority: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    this.logger.log(
      `AgentJobService.list ws=${workspaceId} count=${items.length}`,
    );
    return { success: true, data: items };
  }

  /**
   * Enable or disable a job by toggling its state.
   * OPEN = enabled, PAUSED = disabled.
   */
  async setEnabled(
    workspaceId: string,
    args: AgentJobSetEnabledArgs,
  ): Promise<{ success: boolean; data: unknown }> {
    const jobId = String(args.jobId ?? args.id ?? '').trim();
    if (!jobId) {
      return { success: false, data: { error: 'jobId_required' } };
    }

    const item = await this.prisma.agentWorkItem.findFirst({
      where: { id: jobId, workspaceId },
      select: { id: true, state: true },
    });
    if (!item) {
      throw new NotFoundException(`AgentWorkItem ${jobId} não encontrado no workspace`);
    }

    const enabled = args.enabled !== false; // default true
    const newState = enabled ? 'OPEN' : 'PAUSED';

    const updated = await this.prisma.agentWorkItem.update({
      where: { id: jobId },
      data: { state: newState },
    });

    this.logger.log(
      `AgentJobService.setEnabled ws=${workspaceId} id=${jobId} enabled=${enabled}`,
    );
    return { success: true, data: updated };
  }
}
