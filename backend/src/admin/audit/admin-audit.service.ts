import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AppendAuditInput {
  adminUserId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  // Accept anything JSON-serializable. Callers don't need to satisfy the
  // narrow Prisma.InputJsonValue type — we cast at the persistence boundary.
  details?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

export interface ListAuditFilters {
  adminUserId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  from?: Date;
  to?: Date;
  skip?: number;
  take?: number;
}

/**
 * Append-only audit trail for admin mutations. Any attempt to update or
 * delete rows from admin_audit_logs is blocked by a PostgreSQL trigger
 * (invariant I-ADMIN-1). This service exposes `append()` and `list()` only.
 */
@Injectable()
export class AdminAuditService {
  private readonly logger = new Logger(AdminAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async append(input: AppendAuditInput): Promise<void> {
    try {
      await this.prisma.adminAuditLog.create({
        data: {
          adminUserId: input.adminUserId ?? null,
          action: input.action,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          details:
            input.details === undefined || input.details === null
              ? undefined
              : (input.details as Prisma.InputJsonValue),
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
        },
      });
    } catch (error) {
      // We intentionally swallow audit-append failures so that a transient
      // DB hiccup doesn't block legitimate admin activity. Failures are
      // logged at WARN so ops can detect sustained audit outages. A future
      // SP (ops) will add an alert if append failure rate > 1%.
      this.logger.warn(
        `Falha ao gravar audit log [${input.action}]: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async list(filters: ListAuditFilters): Promise<{
    items: Awaited<ReturnType<PrismaService['adminAuditLog']['findMany']>>;
    total: number;
  }> {
    const where: Prisma.AdminAuditLogWhereInput = {};
    if (filters.adminUserId) {
      where.adminUserId = filters.adminUserId;
    }
    if (filters.action) {
      where.action = { contains: filters.action };
    }
    if (filters.entityType) {
      where.entityType = filters.entityType;
    }
    if (filters.entityId) {
      where.entityId = filters.entityId;
    }
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) {
        where.createdAt.gte = filters.from;
      }
      if (filters.to) {
        where.createdAt.lte = filters.to;
      }
    }

    const skip = Math.max(0, filters.skip ?? 0);
    const take = Math.min(200, Math.max(1, filters.take ?? 50));

    const [items, total] = await this.prisma.$transaction([
      this.prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          adminUser: { select: { id: true, name: true, email: true, role: true } },
        },
      }),
      this.prisma.adminAuditLog.count({ where }),
    ]);

    return { items, total };
  }
}
