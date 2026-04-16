import { Injectable, Logger } from '@nestjs/common';
import {
  AdminChatRole,
  type AdminAction,
  type AdminModule,
  type AdminRole,
  type Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminPermissionsService } from '../permissions/admin-permissions.service';
import { adminErrors } from '../common/admin-api-errors';
import { ChatToolRegistry } from './chat-tool.registry';

const TOOL_S____W_____S_RE = /^\/tool\s+([\w-]+)\s*(\{.*\})?$/s;

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 4000;

export interface SendMessageInput {
  adminUserId: string;
  adminRole: AdminRole;
  sessionId: string | null;
  content: string;
}

export interface ChatSessionView {
  id: string;
  title: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  messages: ChatMessageView[];
}

export interface ChatMessageView {
  id: string;
  role: AdminChatRole;
  content: string;
  toolName: string | null;
  toolArgs: Record<string, unknown> | null;
  toolResult: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * AdminChatService routes a user turn through the LLM-stubbed copilot.
 *
 * v0 behaviour:
 *   - If content begins with "/tool <name> <jsonArgs>", the service
 *     parses it, resolves the tool from the registry, validates
 *     the admin has the required permission (I-ADMIN-C2), executes
 *     the tool, persists the tool call, and returns.
 *   - Otherwise, the assistant response is a canned message
 *     explaining that the LLM provider is not yet wired in this
 *     deploy. This is the correct honest state per CLAUDE.md.
 *   - Every message is persisted as an AdminChatMessage row. The
 *     service never updates or deletes messages — the table is
 *     append-only by convention (I-ADMIN-C3).
 *
 * When the Anthropic SDK integration lands in a follow-up PR, the
 * stub response path is replaced with a real LLM call; the tool
 * call path remains unchanged.
 */
@Injectable()
export class AdminChatService {
  private readonly logger = new Logger(AdminChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: AdminPermissionsService,
    private readonly tools: ChatToolRegistry,
  ) {}

  async sendMessage(input: SendMessageInput): Promise<ChatSessionView> {
    if (input.content.length > MAX_MESSAGE_LENGTH) {
      throw adminErrors.forbidden();
    }

    const session = await this.ensureSession(input.adminUserId, input.sessionId);

    // Persist the user's turn first.
    await this.prisma.adminChatMessage.create({
      data: {
        sessionId: session.id,
        role: AdminChatRole.USER,
        content: input.content,
      },
    });

    // Detect an explicit /tool invocation.
    const toolCall = parseToolInvocation(input.content);
    if (toolCall) {
      await this.runTool(session.id, input.adminUserId, input.adminRole, toolCall);
    } else {
      // Stubbed assistant response — honest state until the LLM
      // provider is wired.
      await this.prisma.adminChatMessage.create({
        data: {
          sessionId: session.id,
          role: AdminChatRole.ASSISTANT,
          content: STUB_RESPONSE,
        },
      });
    }

    await this.prisma.adminChatSession.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    });

    return this.loadSessionView(session.id);
  }

  async listSessions(adminUserId: string): Promise<ChatSessionView[]> {
    const sessions = await this.prisma.adminChatSession.findMany({
      where: { adminUserId, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      take: 20,
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    return sessions.map(toSessionView);
  }

  async getSession(adminUserId: string, sessionId: string): Promise<ChatSessionView> {
    const session = await this.prisma.adminChatSession.findUnique({
      where: { id: sessionId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!session || session.adminUserId !== adminUserId) {
      throw adminErrors.forbidden();
    }
    return toSessionView(session);
  }

  // ---- internals ----------------------------------------------------------

  private async ensureSession(adminUserId: string, sessionId: string | null) {
    if (sessionId) {
      const existing = await this.prisma.adminChatSession.findUnique({
        where: { id: sessionId },
      });
      if (existing && existing.adminUserId === adminUserId && existing.expiresAt > new Date()) {
        return existing;
      }
    }
    return this.prisma.adminChatSession.create({
      data: {
        adminUserId,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
  }

  private async runTool(
    sessionId: string,
    adminUserId: string,
    adminRole: AdminRole,
    call: { name: string; args: Record<string, unknown> },
  ): Promise<void> {
    const tool = this.tools.resolve(call.name);
    if (!tool) {
      await this.prisma.adminChatMessage.create({
        data: {
          sessionId,
          role: AdminChatRole.ASSISTANT,
          content: `Ferramenta ${call.name} não existe. Use /list para ver as disponíveis.`,
        },
      });
      return;
    }

    // I-ADMIN-C2: scope tools to the operator's permission matrix.
    const allowed = await this.permissions.allows(
      adminUserId,
      adminRole,
      tool.permissionModule,
      tool.permissionAction,
    );
    if (!allowed) {
      await this.prisma.adminChatMessage.create({
        data: {
          sessionId,
          role: AdminChatRole.ASSISTANT,
          content: `Você não tem permissão ${tool.permissionAction} em ${tool.permissionModule} para usar ${tool.name}.`,
        },
      });
      return;
    }

    let result: Record<string, unknown>;
    try {
      result = await tool.execute(call.args);
    } catch (error) {
      this.logger.warn(
        `Tool ${tool.name} threw: ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.prisma.adminChatMessage.create({
        data: {
          sessionId,
          role: AdminChatRole.TOOL,
          content: `Erro ao executar ${tool.name}.`,
          toolName: tool.name,
          toolArgs: (call.args ?? {}) as Prisma.InputJsonValue,
          toolResult: {
            error: error instanceof Error ? error.message : 'unknown',
          } as Prisma.InputJsonValue,
        },
      });
      return;
    }

    // I-ADMIN-C3: append tool call + tool result.
    await this.prisma.adminChatMessage.create({
      data: {
        sessionId,
        role: AdminChatRole.TOOL,
        content: `${tool.name}`,
        toolName: tool.name,
        toolArgs: (call.args ?? {}) as Prisma.InputJsonValue,
        toolResult: result as Prisma.InputJsonValue,
      },
    });
  }

  private async loadSessionView(sessionId: string): Promise<ChatSessionView> {
    const session = await this.prisma.adminChatSession.findUnique({
      where: { id: sessionId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!session) {
      throw adminErrors.forbidden();
    }
    return toSessionView(session);
  }
}

const STUB_RESPONSE =
  'Copiloto ainda não ligado neste deploy. Para executar uma ferramenta ' +
  'diretamente, use /tool <nome> <json-args>, por exemplo: ' +
  '/tool searchWorkspaces {"query":"acme"}.';

function parseToolInvocation(
  content: string,
): { name: string; args: Record<string, unknown> } | null {
  const match = content.trim().match(TOOL_S____W_____S_RE);
  if (!match) return null;
  const name = match[1];
  let args: Record<string, unknown> = {};
  if (match[2]) {
    try {
      const parsed: unknown = JSON.parse(match[2]);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        args = parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return { name, args };
}

function toSessionView(session: {
  id: string;
  title: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  messages: Array<{
    id: string;
    role: AdminChatRole;
    content: string;
    toolName: string | null;
    toolArgs: unknown;
    toolResult: unknown;
    createdAt: Date;
  }>;
}): ChatSessionView {
  return {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt.toISOString(),
    lastUsedAt: session.lastUsedAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    messages: session.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      toolName: m.toolName,
      toolArgs: (m.toolArgs as Record<string, unknown> | null) ?? null,
      toolResult: (m.toolResult as Record<string, unknown> | null) ?? null,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

// Silence unused-import lints if this file is the last consumer in a
// future split — the imported types are part of the public surface.
export type { AdminAction, AdminModule };
