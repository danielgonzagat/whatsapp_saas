import { randomBytes } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

/** Api keys service. */
@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  /** List. */
  async list(workspaceId: string) {
    return this.prisma.apiKey.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        lastUsedAt: true,
        workspaceId: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** Create. */
  async create(workspaceId: string, name: string) {
    const key = `sk_live_${randomBytes(24).toString('hex')}`;
    return this.prisma.apiKey.create({
      data: {
        workspaceId,
        name,
        key,
      },
    });
  }

  /** Delete. */
  async delete(workspaceId: string, id: string) {
    const key = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!key || key.workspaceId !== workspaceId) {
      throw new NotFoundException('API Key not found');
    }
    await this.auditService.log({
      workspaceId,
      action: 'DELETE_RECORD',
      resource: 'ApiKey',
      resourceId: id,
      details: { deletedBy: 'user', name: key.name },
    });
    return this.prisma.apiKey.delete({ where: { id } });
  }

  /** Validate key. */
  async validateKey(key: string) {
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { key },
      include: { workspace: true },
    });

    if (apiKey) {
      // Async update last used (fire and forget)
      this.prisma.apiKey
        .update({
          where: { id: apiKey.id },
          data: { lastUsedAt: new Date() },
        })
        .catch((err) => this.logger.warn('Failed to update apiKey lastUsedAt', err.message));
    }

    return apiKey;
  }
}
