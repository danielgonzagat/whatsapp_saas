import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

// ---------------------------------------------------------------------------
// Types for WaitForReply node handling
// ---------------------------------------------------------------------------

/** Shape of data stored in a waitForReply node */
interface WaitForReplyNodeData {
  timeout?: number;
  timeoutUnit?: 'seconds' | 'minutes' | 'hours' | 'days';
  fallbackMessage?: string;
}

/** Extra fields persisted inside FlowExecution.state while waiting */
interface WaitState {
  user?: string;
  waitNodeId: string;
  waitingForContact: string;
  waitExpiresAt: string; // ISO-8601 absolute timestamp
  fallbackMessage?: string;
  [key: string]: unknown;
}

/** Return value of resumeFromWait so the caller (worker) knows what to do */
interface ResumeResult {
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

@Injectable()
export class FlowsService {
  private readonly logger = new Logger(FlowsService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async save(
    workspaceId: string,
    flowId: string,
    data: { nodes: any; edges: any; name?: string },
  ) {
    await this.audit.log({
      workspaceId,
      action: 'UPDATE_FLOW',
      resource: 'Flow',
      resourceId: flowId,
      details: { name: data.name, nodesCount: data.nodes?.length },
    });

    return this.prisma.flow.upsert({
      where: { id: flowId },
      update: {
        nodes: data.nodes,
        edges: data.edges,
        name: data.name || undefined,
      },
      create: {
        id: flowId,
        workspaceId,
        nodes: data.nodes,
        edges: data.edges,
        name: data.name || 'Fluxo Sem Nome',
      },
    });
  }

  async get(workspaceId: string, flowId: string) {
    return this.prisma.flow.findFirst({
      where: { id: flowId, workspaceId },
    });
  }

  async list(workspaceId: string) {
    return this.prisma.flow.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async listExecutions(workspaceId: string, limit = 50) {
    return this.prisma.flowExecution.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        contact: { select: { name: true, phone: true } },
        flow: { select: { name: true } },
      },
    });
  }

  async saveVersion(params: {
    workspaceId: string;
    flowId: string;
    nodes: any;
    edges: any;
    label?: string;
    createdById?: string | null;
  }) {
    const { workspaceId, flowId, nodes, edges, label, createdById } = params;

    // Garante que o flow exista
    await this.prisma.flow.upsert({
      where: { id: flowId },
      update: {},
      create: {
        id: flowId,
        workspaceId,
        nodes,
        edges,
        name: label || 'Fluxo sem nome',
      },
    });

    return this.prisma.flowVersion.create({
      data: {
        workspaceId,
        flowId,
        nodes,
        edges,
        label: label || null,
        createdById: createdById || null,
      },
      select: {
        id: true,
        label: true,
        createdAt: true,
      },
    });
  }

  async listVersions(workspaceId: string, flowId: string) {
    return this.prisma.flowVersion.findMany({
      where: { workspaceId, flowId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        label: true,
        createdAt: true,
        createdById: true,
      },
      take: 50,
    });
  }

  async getVersion(workspaceId: string, versionId: string) {
    return this.prisma.flowVersion.findFirst({
      where: { id: versionId, workspaceId },
    });
  }

  async getExecution(workspaceId: string, executionId: string) {
    return this.prisma.flowExecution.findFirst({
      where: { id: executionId, workspaceId },
      include: {
        contact: true,
        flow: true,
      },
    });
  }

  async createExecution(workspaceId: string, flowId: string, user: string) {
    const normalizedUser = (user || '').replace(/\D/g, '');

    // Tenta achar contato ou cria
    let contact = await this.prisma.contact.findUnique({
      where: { workspaceId_phone: { workspaceId, phone: normalizedUser } },
    });

    if (!contact) {
      contact = await this.prisma.contact.create({
        data: {
          workspaceId,
          phone: normalizedUser,
          name: normalizedUser, // Default name
        },
      });
    }

    return this.prisma.flowExecution.create({
      data: {
        workspaceId,
        flowId,
        contactId: contact.id,
        status: 'PENDING',
        logs: [],
        state: { user: normalizedUser },
      },
    });
  }

  async retryExecution(workspaceId: string, executionId: string) {
    const execution = await this.prisma.flowExecution.findUnique({
      where: { id: executionId, workspaceId },
      include: {
        contact: true,
        flow: true,
      },
    });

    if (!execution) {
      throw new NotFoundException('Execution not found');
    }

    await this.audit.log({
      workspaceId,
      action: 'RETRY_EXECUTION',
      resource: 'FlowExecution',
      resourceId: executionId,
      details: { flowId: execution.flowId, contactId: execution.contactId },
    });

    // Reset execution state
    return this.prisma.flowExecution.update({
      where: { id: executionId },
      data: {
        status: 'PENDING',
        logs: {
          push: { timestamp: Date.now(), message: 'Retrying execution...' },
        },
      },
      include: {
        contact: true,
        flow: true,
      },
    });
  }

  async logExecution(params: {
    workspaceId: string;
    flowId: string;
    user?: string | null;
    logs: { nodeId?: string | null; message: string; level?: string | null }[];
  }) {
    const { workspaceId, flowId, user, logs } = params;
    const trimmedLogs = (logs || []).slice(-200);

    let contactId = flowId; // Fallback if no user provided (should not happen in real usage)

    if (user) {
      // Try to find or create contact for logging
      let contact = await this.prisma.contact.findUnique({
        where: { workspaceId_phone: { workspaceId, phone: user } },
      });

      if (!contact) {
        try {
          contact = await this.prisma.contact.create({
            data: {
              workspaceId,
              phone: user,
              name: user,
            },
          });
        } catch {
          // Race condition or error, try finding again
          contact = await this.prisma.contact.findUnique({
            where: { workspaceId_phone: { workspaceId, phone: user } },
          });
        }
      }
      if (contact) contactId = contact.id;
    }

    return this.prisma.flowExecution.create({
      data: {
        workspaceId,
        flowId,
        contactId,
        status: 'COMPLETED',
        logs: trimmedLogs,
        state: { user },
      },
      select: { id: true, createdAt: true },
    });
  }

  async listExecutionLogs(workspaceId: string, flowId: string, limit = 20) {
    return this.prisma.flowExecution.findMany({
      where: { workspaceId, flowId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        createdAt: true,
        logs: true,
      },
    });
  }

  // ==========================================================================
  // WaitForReply node support
  // ==========================================================================

  /**
   * Called by the flow worker when it encounters a 'waitForReply' node.
   *
   * Persists the execution as WAITING_INPUT so it can be resumed later when
   * the contact replies or the timeout expires.
   */
  async pauseForWaitNode(params: {
    executionId: string;
    contactPhone: string;
    waitNodeId: string;
    nodeData: WaitForReplyNodeData;
  }): Promise<void> {
    const { executionId, contactPhone, waitNodeId, nodeData } = params;

    // Calculate absolute expiry timestamp from relative timeout
    const timeoutMs = this.resolveTimeoutMs(
      nodeData.timeout ?? 60,
      nodeData.timeoutUnit ?? 'minutes',
    );
    const waitExpiresAt = new Date(Date.now() + timeoutMs).toISOString();

    const execution = await this.prisma.flowExecution.findUnique({
      where: { id: executionId },
    });
    if (!execution) {
      this.logger.warn(
        `[WaitForReply] Execution ${executionId} not found, cannot pause`,
      );
      return;
    }

    // Merge wait metadata into the existing state JSON
    const existingState = (execution.state as Record<string, unknown>) || {};
    const waitState: WaitState = {
      ...existingState,
      waitNodeId,
      waitingForContact: contactPhone,
      waitExpiresAt,
      fallbackMessage: nodeData.fallbackMessage || undefined,
    };

    await this.prisma.flowExecution.update({
      where: { id: executionId },
      data: {
        status: 'WAITING_INPUT',
        currentNodeId: waitNodeId,
        state: waitState as any,
        logs: {
          push: {
            timestamp: Date.now(),
            nodeId: waitNodeId,
            message: `Aguardando resposta do contato ${contactPhone} (expira em ${waitExpiresAt})`,
            level: 'info',
          },
        },
      },
    });

    this.logger.log(
      `[WaitForReply] Execution ${executionId} paused at node ${waitNodeId}, ` +
        `waiting for ${contactPhone} until ${waitExpiresAt}`,
    );
  }

  /**
   * Called when a contact sends a message (via the 'resume-flow' BullMQ job).
   *
   * Finds the WAITING_INPUT execution for that contact and resumes it through
   * the "Respondeu" (replied) output edge. If the wait has expired, resumes
   * through the "Timeout" edge instead.
   */
  async resumeFromWait(params: {
    contactPhone: string;
    workspaceId: string;
    message?: string;
  }): Promise<ResumeResult> {
    const { contactPhone, workspaceId, message } = params;

    // Find the waiting execution whose state.waitingForContact matches.
    // Prisma's Json filtering works on PostgreSQL with path-based filters.
    const executions = await this.prisma.flowExecution.findMany({
      where: {
        workspaceId,
        status: 'WAITING_INPUT',
        state: {
          path: ['waitingForContact'],
          equals: contactPhone,
        },
      },
      select: { id: true, workspaceId: true, flowId: true, contactId: true, status: true, state: true, currentNodeId: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 1,
    });

    if (executions.length === 0) {
      return { resumed: false };
    }

    const execution = executions[0];
    const state = (execution.state as WaitState) || ({} as WaitState);
    const now = new Date();
    const expired = state.waitExpiresAt
      ? now > new Date(state.waitExpiresAt)
      : false;

    const resumeEdge: 'Respondeu' | 'Timeout' = expired
      ? 'Timeout'
      : 'Respondeu';

    // Store the reply message in state so the worker can use it downstream
    const updatedState: Record<string, unknown> = {
      ...state,
      lastReplyMessage: message || null,
      resumedAt: now.toISOString(),
      resumeEdge,
    };

    await this.prisma.flowExecution.update({
      where: { id: execution.id },
      data: {
        status: 'RUNNING',
        state: updatedState as any,
        logs: {
          push: {
            timestamp: Date.now(),
            nodeId: state.waitNodeId,
            message: expired
              ? `Timeout expirado — retomando pelo edge "Timeout"`
              : `Contato ${contactPhone} respondeu — retomando pelo edge "Respondeu"`,
            level: 'info',
          },
        },
      },
    });

    this.logger.log(
      `[WaitForReply] Execution ${execution.id} resumed via "${resumeEdge}" ` +
        `(contact: ${contactPhone})`,
    );

    return {
      resumed: true,
      executionId: execution.id,
      flowId: execution.flowId,
      workspaceId: execution.workspaceId,
      resumeEdge,
      waitNodeId: state.waitNodeId,
      fallbackMessage: expired ? state.fallbackMessage : undefined,
      state: updatedState,
    };
  }

  /**
   * Scans for WAITING_INPUT executions whose timeout has expired and
   * transitions them through the "Timeout" edge.
   *
   * Intended to be called from a scheduled job (e.g. cron every minute) or
   * invoked inline during message processing as a lightweight sweep.
   *
   * Returns the list of execution IDs that were timed out.
   */
  async expireWaitTimeouts(
    workspaceId?: string,
    batchSize = 50,
  ): Promise<ResumeResult[]> {
    const now = new Date();
    const results: ResumeResult[] = [];

    // Prisma doesn't support lte on Json paths directly, so we fetch all
    // WAITING_INPUT candidates and filter by expiry in application code.
    // The batch size keeps memory bounded.
    const candidates = await this.prisma.flowExecution.findMany({
      where: {
        status: 'WAITING_INPUT',
        ...(workspaceId ? { workspaceId } : {}),
      },
      select: { id: true, workspaceId: true, flowId: true, contactId: true, status: true, state: true, currentNodeId: true, updatedAt: true },
      orderBy: { updatedAt: 'asc' },
      take: batchSize,
    });

    for (const execution of candidates) {
      const state = (execution.state as WaitState) || ({} as WaitState);
      if (!state.waitExpiresAt) continue;
      if (now <= new Date(state.waitExpiresAt)) continue;

      // Expired — transition to Timeout
      const updatedState: Record<string, unknown> = {
        ...state,
        resumedAt: now.toISOString(),
        resumeEdge: 'Timeout',
      };

      await this.prisma.flowExecution.update({
        where: { id: execution.id },
        data: {
          status: 'RUNNING',
          state: updatedState as any,
          logs: {
            push: {
              timestamp: Date.now(),
              nodeId: state.waitNodeId,
              message: `Timeout expirado para contato ${state.waitingForContact} — retomando pelo edge "Timeout"`,
              level: 'warn',
            },
          },
        },
      });

      this.logger.log(
        `[WaitForReply] Execution ${execution.id} expired (timeout), resuming via "Timeout"`,
      );

      results.push({
        resumed: true,
        executionId: execution.id,
        flowId: execution.flowId,
        workspaceId: execution.workspaceId,
        resumeEdge: 'Timeout',
        waitNodeId: state.waitNodeId,
        fallbackMessage: state.fallbackMessage,
        state: updatedState,
      });
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Convert a relative timeout value + unit into milliseconds. */
  private resolveTimeoutMs(
    timeout: number,
    unit: 'seconds' | 'minutes' | 'hours' | 'days',
  ): number {
    const multipliers: Record<string, number> = {
      seconds: 1_000,
      minutes: 60_000,
      hours: 3_600_000,
      days: 86_400_000,
    };
    return Math.max(1_000, timeout * (multipliers[unit] || 60_000));
  }

  // ── Flow Variables ──

  async listVariables(workspaceId: string) {
    return this.prisma.variable.findMany({
      where: { workspaceId },
      select: { id: true, workspaceId: true, key: true, value: true, type: true, createdAt: true, updatedAt: true },
      orderBy: { key: 'asc' },
      take: 500,
    });
  }

  async setVariable(
    workspaceId: string,
    key: string,
    value: string,
    type: string = 'STRING',
  ) {
    return this.prisma.variable.upsert({
      where: { workspaceId_key: { workspaceId, key } },
      create: { workspaceId, key, value, type },
      update: { value, type },
    });
  }
}
