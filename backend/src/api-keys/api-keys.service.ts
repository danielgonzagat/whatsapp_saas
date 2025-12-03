import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class ApiKeysService {
  constructor(private prisma: PrismaService) {}

  async list(workspaceId: string) {
    return this.prisma.apiKey.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(workspaceId: string, name: string) {
    const key = `sk_live_${crypto.randomBytes(24).toString('hex')}`;
    return this.prisma.apiKey.create({
      data: {
        workspaceId,
        name,
        key,
      },
    });
  }

  async delete(workspaceId: string, id: string) {
    const key = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!key || key.workspaceId !== workspaceId) {
      throw new NotFoundException('API Key not found');
    }
    return this.prisma.apiKey.delete({ where: { id } });
  }

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
        .catch(() => {}); // Ignore errors
    }

    return apiKey;
  }
}
