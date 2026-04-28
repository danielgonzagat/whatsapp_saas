import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Audit service. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Record a system action for security and compliance.
   * @param data.workspaceId - The workspace where the action occurred
   * @param data.action - Upper case action name (e.g., CREATE_FLOW, DELETE_CONTACT)
   * @param data.resource - The entity affected (e.g., Flow, Contact)
   * @param data.resourceId - The ID of the entity
   * @param data.agentId - (Optional) Who performed the action
   * @param data.details - (Optional) JSON object with diff or extra info
   */
  /**
   * Write an audit log entry using a Prisma transaction client so the audit
   * record is atomically committed with the surrounding operation.
   * Falls back to the default prisma client when no tx is provided.
   */
  async logWithTx(
    tx: { auditLog: { create: (args: Record<string, unknown>) => Promise<unknown> } },
    data: {
      workspaceId: string;
      action: string;
      resource: string;
      resourceId?: string;
      agentId?: string;
      details?: Record<string, unknown>;
      ipAddress?: string;
      userAgent?: string;
    },
  ) {
    await tx.auditLog.create({
      data: {
        workspaceId: data.workspaceId,
        action: data.action,
        resource: data.resource,
        resourceId: data.resourceId,
        agentId: data.agentId,
        details: data.details ?? {},
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      },
    });
  }

  /** Log. */
  async log(data: {
    workspaceId: string;
    action: string;
    resource: string;
    resourceId?: string;
    agentId?: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }) {
    try {
      await this.prisma.auditLog.create({
        data: {
          workspaceId: data.workspaceId,
          action: data.action,
          resource: data.resource,
          resourceId: data.resourceId,
          agentId: data.agentId,
          details: (data.details ?? {}) as Prisma.InputJsonValue,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
        },
      });
    } catch (error: unknown) {
      this.logger.error(
        `CRITICAL: Audit log failed — ${error instanceof Error ? error.message : 'unknown_error'}`,
        error instanceof Error ? error.stack : undefined,
      );
      // Attempt one retry
      try {
        await this.prisma.auditLog.create({
          data: {
            workspaceId: data.workspaceId,
            action: data.action,
            resource: data.resource,
            resourceId: data.resourceId,
            agentId: data.agentId,
            details: (data.details ?? {}) as Prisma.InputJsonValue,
            ipAddress: data.ipAddress,
            userAgent: data.userAgent,
          },
        });
      } catch (retryError: unknown) {
        const retryErrorInstanceofError =
          retryError instanceof Error
            ? retryError
            : new Error(typeof retryError === 'string' ? retryError : 'unknown error');
        this.logger.error(
          `CRITICAL: Audit log retry also failed — ${retryErrorInstanceofError?.message}`,
        );
      }
    }
  }

  /** Get logs. */
  async getLogs(workspaceId: string, limit = 50, offset = 0) {
    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          agent: {
            select: { name: true, email: true },
          },
        },
      }),
      this.prisma.auditLog.count({ where: { workspaceId } }),
    ]);

    return {
      data,
      total,
      page: Math.floor(offset / limit) + 1,
      lastPage: Math.ceil(total / limit),
    };
  }
}
