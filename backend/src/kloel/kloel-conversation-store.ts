import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildTimestampedRuntimeKey } from './kloel-id.util';
import { OpsAlertService } from '../observability/ops-alert.service';

const A_Z0_9_RE = /[^a-z0-9_:-]+/g;

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Kloel conversation store. */
export class KloelConversationStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: {
      warn(message: string, error?: unknown): void;
      error(message: string, error?: unknown): void;
    },
    private readonly opsAlert?: OpsAlertService,
  ) {}

  /** Get conversation history. */
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

  /** Save message. */
  async saveMessage(workspaceId: string, role: string, content: string): Promise<void> {
    try {
      await this.prisma.kloelMessage.create({
        data: {
          workspaceId,
          role,
          content,
        },
      });
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'KloelConversationStore.create');
      this.logger.warn('Erro ao salvar mensagem:', error); // Intencional: message persistence failure is non-critical.
    }
  }

  /** Save memory. */
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
        buildTimestampedRuntimeKey(safeType);
      const value =
        metadataRecord.value !== undefined ? toInputJsonValue(metadataRecord.value) : { content };
      const category =
        typeof metadataRecord.category === 'string' && metadataRecord.category.trim()
          ? metadataRecord.category.trim()
          : 'general';
      const safeMetadata = metadata ? toInputJsonValue(metadata) : {};

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
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'KloelConversationStore.upsert');
      this.logger.error('Erro ao salvar memória:', error); // Intencional: memory persistence failure is non-critical.
    }
  }
}
