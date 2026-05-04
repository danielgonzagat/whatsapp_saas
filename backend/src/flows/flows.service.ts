import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { OpsAlertService } from '../observability/ops-alert.service';

const D_RE = /\D/g;

import type {
  WaitForReplyNodeData,
  WaitState,
  ResumeResult,
} from './__companions__/flows.service.companion';
import {
  pauseForWaitNode as pauseForWaitNodeFn,
  resumeFromWait as resumeFromWaitFn,
  expireWaitTimeouts as expireWaitTimeoutsFn,
} from './__companions__/flows.service.companion';
export type { WaitForReplyNodeData, WaitState, ResumeResult };

/** Flows service. */
@Injectable()
export class FlowsService {
  private readonly logger = new Logger(FlowsService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  /** Save. */
  async save(
    workspaceId: string,
    flowId: string,
    data: { nodes: unknown; edges: unknown; name?: string },
  ) {
    await this.audit.log({
      workspaceId,
      action: 'UPDATE_FLOW',
      resource: 'Flow',
      resourceId: flowId,
      details: { name: data.name, nodesCount: Array.isArray(data.nodes) ? data.nodes.length : 0 },
    });

    return this.prisma.flow.upsert({
      where: { id: flowId, workspaceId },
      update: {
        nodes: data.nodes as Prisma.InputJsonValue,
        edges: data.edges as Prisma.InputJsonValue,
        name: data.name || undefined,
      },
      create: {
        id: flowId,
        workspaceId,
        nodes: data.nodes as Prisma.InputJsonValue,
        edges: data.edges as Prisma.InputJsonValue,
        name: data.name || 'Fluxo Sem Nome',
      },
    });
  }

  /** Get. */
  async get(workspaceId: string, flowId: string) {
    return this.prisma.flow.findFirst({
      where: { id: flowId, workspaceId },
    });
  }

  /** List. */
  async list(workspaceId: string) {
    return this.prisma.flow.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /** List executions. */
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

  /** Save version. */
  async saveVersion(params: {
    workspaceId: string;
    flowId: string;
    nodes: unknown;
    edges: unknown;
    label?: string;
    createdById?: string | null;
  }) {
    const { workspaceId, flowId, nodes, edges, label, createdById } = params;

    // Garante que o flow exista
    await this.prisma.flow.upsert({
      where: { id: flowId, workspaceId },
      update: {},
      create: {
        id: flowId,
        workspaceId,
        nodes: nodes as Prisma.InputJsonValue,
        edges: edges as Prisma.InputJsonValue,
        name: label || 'Fluxo sem nome',
      },
    });

    return this.prisma.flowVersion.create({
      data: {
        workspaceId,
        flowId,
        nodes: nodes as Prisma.InputJsonValue,
        edges: edges as Prisma.InputJsonValue,
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

  /** List versions. */
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

  /** Get version. */
  async getVersion(workspaceId: string, versionId: string) {
    return this.prisma.flowVersion.findFirst({
      where: { id: versionId, workspaceId },
    });
  }

  /** Get execution. */
  async getExecution(workspaceId: string, executionId: string) {
    return this.prisma.flowExecution.findFirst({
      where: { id: executionId, workspaceId },
      include: {
        contact: true,
        flow: true,
      },
    });
  }

  /** Create execution. */
  async createExecution(workspaceId: string, flowId: string, user: string) {
    const normalizedUser = (user || '').replace(D_RE, '');

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

  /** Retry execution. */
  async retryExecution(workspaceId: string, executionId: string) {
    const execution = await this.prisma.flowExecution.findFirst({
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
    await this.prisma.flowExecution.updateMany({
      where: { id: executionId, workspaceId },
      data: {
        status: 'PENDING',
        logs: {
          push: { timestamp: Date.now(), message: 'Retrying execution...' },
        },
      },
    });

    return this.prisma.flowExecution.findFirst({
      where: { id: executionId, workspaceId },
      include: {
        contact: true,
        flow: true,
      },
    });
  }

  /** Log execution. */
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
      if (contact) {
        contactId = contact.id;
      }
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

  /** List execution logs. */
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
  // WaitForReply node support — thin wrappers delegating to companion
  // ==========================================================================

  async pauseForWaitNode(params: {
    executionId: string;
    contactPhone: string;
    waitNodeId: string;
    nodeData: WaitForReplyNodeData;
  }): Promise<void> {
    return pauseForWaitNodeFn({ prisma: this.prisma, logger: this.logger }, params);
  }

  async resumeFromWait(params: {
    contactPhone: string;
    workspaceId: string;
    message?: string;
  }): Promise<ResumeResult> {
    return resumeFromWaitFn({ prisma: this.prisma, logger: this.logger }, params);
  }

  async expireWaitTimeouts(workspaceId?: string, batchSize = 50): Promise<ResumeResult[]> {
    return expireWaitTimeoutsFn(
      { prisma: this.prisma, logger: this.logger },
      workspaceId,
      batchSize,
    );
  }

  // ── Flow Variables ──

  async listVariables(workspaceId: string) {
    return this.prisma.variable.findMany({
      where: { workspaceId },
      select: {
        id: true,
        workspaceId: true,
        key: true,
        value: true,
        type: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { key: 'asc' },
      take: 500,
    });
  }

  /** Set variable. */
  async setVariable(workspaceId: string, key: string, value: string, type = 'STRING') {
    return this.prisma.variable.upsert({
      where: { workspaceId_key: { workspaceId, key } },
      create: { workspaceId, key, value, type },
      update: { value, type },
    });
  }
}
