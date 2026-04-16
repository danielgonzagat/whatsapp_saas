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
    if (!workspaceId) return [];

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
    metadata?: any,
  ): Promise<void> {
    try {
      const safeType = String(type || 'general')
        .trim()
        .toLowerCase()
        .replace(A_Z0_9_RE, '_');
      const key =
        metadata?.key || `${safeType}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

      await this.prisma.kloelMemory.upsert({
        where: {
          workspaceId_key: {
            workspaceId,
            key,
          },
        },
        update: {
          value: metadata?.value || { content },
          category: metadata?.category || 'general',
          type: safeType,
          content,
          metadata: metadata || {},
        },
        create: {
          workspaceId,
          key,
          value: metadata?.value || { content },
          category: metadata?.category || 'general',
          type: safeType,
          content,
          metadata: metadata || {},
        },
      });
    } catch (error) {
      this.logger.error('Erro ao salvar memória:', error);
    }
  }
}
