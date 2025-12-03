import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
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
  async log(data: {
    workspaceId: string;
    action: string;
    resource: string;
    resourceId?: string;
    agentId?: string;
    details?: Record<string, any>;
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
          details: data.details ?? {},
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
        },
      });
    } catch (error) {
      // Audit logging should never break the main flow, but we should log the error
      console.error('Failed to write audit log', error);
    }
  }

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
