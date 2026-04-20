import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const A_Z0_9_RE = /[^a-z0-9_:-]+/g;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export class KloelConversationStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: {
      warn(message: string, error?: unknown): void;
      error(message: string, error?: unknown): void;
    },
  ) {}

  async getConversationHistory(workspaceId?: string): Promise<ChatMessage[]> {
    if (!workspaceId) {
      return [];
    }

    try {
      const messages = await this.prisma.kloelMessage.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'asc' },
        take: 20,
        select: { role: true, content: true },
      });

      return messages.map((message) => ({
        role: message.role as 'user' | 'assistant',
        content: message.content,
      }));
    } catch {
      return [];
    }
  }

  async saveMessage(workspaceId: string, role: string, content: string): Promise<void> {
    try {
      await this.prisma.kloelMessage.create({
        data: {
          workspaceId,
          role,
          content,
        },
      });
    } catch (error) {
      this.logger.warn('Erro ao salvar mensagem:', error);
    }
  }

  async saveMemory(
    workspaceId: string,
    type: string,
    content: string,
    metadata?: Prisma.InputJsonValue,
  ): Promise<void> {
    try {
      const metadataRecord =
        metadata && typeof metadata === 'object' && !Array.isArray(metadata)
          ? (metadata as Record<string, unknown>)
          : {};
      const safeType = String(type || 'general')
        .trim()
        .toLowerCase()
        .replace(A_Z0_9_RE, '_');
      const key =
        (typeof metadataRecord.key === 'string' ? metadataRecord.key : undefined) ||
        `${safeType}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
      const value =
        metadataRecord.value !== undefined
          ? (JSON.parse(JSON.stringify(metadataRecord.value)) as Prisma.InputJsonValue)
          : ({ content } as Prisma.InputJsonValue);
      const category =
        typeof metadataRecord.category === 'string' && metadataRecord.category.trim()
          ? metadataRecord.category.trim()
          : 'general';
      const safeMetadata = metadata
        ? (JSON.parse(JSON.stringify(metadata)) as Prisma.InputJsonValue)
        : ({} as Prisma.InputJsonValue);

      await this.prisma.kloelMemory.upsert({
        where: {
          workspaceId_key: {
            workspaceId,
            key,
          },
        },
        update: {
          value,
          category,
          type: safeType,
          content,
          metadata: safeMetadata,
        },
        create: {
          workspaceId,
          key,
          value,
          category,
          type: safeType,
          content,
          metadata: safeMetadata,
        },
      });
    } catch (error) {
      this.logger.error('Erro ao salvar memória:', error);
    }
  }
}
