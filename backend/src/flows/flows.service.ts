import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class FlowsService {
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
      throw new Error('Execution not found');
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
}
