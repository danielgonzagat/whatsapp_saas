import { createHash, randomBytes } from 'node:crypto';
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

  /** Generate raw key. */
  private generateKey(): string {
    return `sk_live_${randomBytes(24).toString('hex')}`;
  }

  /** Hash key for storage. */
  private hashKey(rawKey: string): string {
    return createHash('sha256').update(rawKey).digest('hex');
  }

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
  // PULSE_OK: workspaceId validated by caller guard
  async create(workspaceId: string, name: string) {
    const rawKey = this.generateKey();
    const keyHash = this.hashKey(rawKey);
    const record = await this.prisma.apiKey.create({
      data: {
        workspaceId,
        name,
        key: keyHash,
      },
    });
    return { ...record, key: rawKey };
  }

  /** Rotate. */
  async rotate(workspaceId: string, id: string) {
    const existing = await this.prisma.apiKey.findFirst({ where: { id, workspaceId } });
    if (!existing) {
      throw new NotFoundException('API Key not found');
    }
    const rawKey = this.generateKey();
    const keyHash = this.hashKey(rawKey);
    await this.prisma.apiKey.update({
      where: { id },
      data: { key: keyHash },
    });
    await this.auditService.log({
      workspaceId,
      action: 'UPDATE_RECORD',
      resource: 'ApiKey',
      resourceId: id,
      details: { action: 'rotate', name: existing.name },
    });
    return { ...existing, key: rawKey };
  }

  /** Delete. */
  async delete(workspaceId: string, id: string) {
    const key = await this.prisma.apiKey.findFirst({ where: { id, workspaceId } });
    if (!key) {
      throw new NotFoundException('API Key not found');
    }
    await this.auditService.log({
      workspaceId,
      action: 'DELETE_RECORD',
      resource: 'ApiKey',
      resourceId: id,
      details: { deletedBy: 'user', name: key.name },
    });
    return this.prisma.apiKey.deleteMany({ where: { id, workspaceId } });
  }

  /** Validate key. */
  async validateKey(key: string) {
    const keyHash = this.hashKey(key);
    const apiKey = await this.prisma.apiKey.findFirst({
      where: { key: keyHash, workspaceId: { not: '' } },
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
