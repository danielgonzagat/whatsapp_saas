import { randomBytes } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { hashApiKey, maskApiKeyForDisplay } from './api-key-hash';

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async list(workspaceId: string) {
    const keys = await this.prisma.apiKey.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        key: true,
        createdAt: true,
        lastUsedAt: true,
        workspaceId: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return keys.map(({ key, ...rest }) => ({
      ...rest,
      maskedKey: maskApiKeyForDisplay(key),
    }));
  }

  async create(workspaceId: string, name: string) {
    const rawKey = `sk_live_${randomBytes(24).toString('hex')}`;
    const created = await this.prisma.apiKey.create({
      data: {
        workspaceId,
        name,
        key: hashApiKey(rawKey),
      },
    });

    return {
      ...created,
      key: rawKey,
      maskedKey: maskApiKeyForDisplay(rawKey),
    };
  }

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
    await this.prisma.apiKey.delete({ where: { id } });
    return { ok: true };
  }

  async validateKey(key: string) {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) {
      return null;
    }

    let apiKey = await this.prisma.apiKey.findUnique({
      where: { key: hashApiKey(normalizedKey) },
      include: { workspace: true },
    });
    let legacyPlaintextMatch = false;

    if (!apiKey) {
      apiKey = await this.prisma.apiKey.findUnique({
        where: { key: normalizedKey },
        include: { workspace: true },
      });
      legacyPlaintextMatch = Boolean(apiKey);
    }

    if (apiKey) {
      // Async update last used (fire and forget)
      this.prisma.apiKey
        .update({
          where: { id: apiKey.id },
          data: {
            lastUsedAt: new Date(),
            ...(legacyPlaintextMatch ? { key: hashApiKey(normalizedKey) } : {}),
          },
        })
        .catch((err) => this.logger.warn('Failed to update apiKey lastUsedAt', err.message));
    }

    return apiKey;
  }
}
