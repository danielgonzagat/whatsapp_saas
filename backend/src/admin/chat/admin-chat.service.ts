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
const LIST_RE = /^\/list\b/i;

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
 *   - If content begins with "/list", the service returns the
 *     currently registered tools the operator may invoke.
 *   - Otherwise, the assistant gives an operational fallback
 *     message and may infer a lightweight searchWorkspaces call
 *     from simple natural-language prompts.
 *   - Every message is persisted as an AdminChatMessage row. The
 *     service never updates or deletes messages — the table is
 *     append-only by convention (I-ADMIN-C3).
 *
 * When the full LLM orchestration lands, the natural-language path
 * expands. The explicit tool call path remains unchanged.
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

    if (LIST_RE.test(input.content.trim())) {
      const visibleTools = await this.listAllowedTools(input.adminUserId, input.adminRole);
      await this.prisma.adminChatMessage.create({
        data: {
          sessionId: session.id,
          role: AdminChatRole.ASSISTANT,
          content: visibleTools,
        },
      });
    } else {
      // Detect an explicit /tool invocation or a lightweight
      // natural-language search intent.
      const toolCall = parseToolInvocation(input.content) ?? inferToolInvocation(input.content);
      if (toolCall) {
        await this.runTool(session.id, input.adminUserId, input.adminRole, toolCall);
      } else {
        await this.prisma.adminChatMessage.create({
          data: {
            sessionId: session.id,
            role: AdminChatRole.ASSISTANT,
            content: ACTIVE_RESPONSE,
          },
        });
      }
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

    await this.prisma.adminChatMessage.create({
      data: {
        sessionId,
        role: AdminChatRole.ASSISTANT,
        content: summarizeToolResult(tool.name, result),
      },
    });
  }

  private async listAllowedTools(adminUserId: string, adminRole: AdminRole): Promise<string> {
    const tools = await Promise.all(
      this.tools.listAll().map(async (tool) => {
        const allowed = await this.permissions.allows(
          adminUserId,
          adminRole,
          tool.permissionModule,
          tool.permissionAction,
        );
        return allowed ? tool : null;
      }),
    );

    const allowedTools = tools.filter((tool): tool is NonNullable<typeof tool> => Boolean(tool));
    if (allowedTools.length === 0) {
      return 'Nenhuma ferramenta está disponível para a sua permissão atual.';
    }

    return [
      'Ferramentas disponíveis agora:',
      ...allowedTools.map((tool) => `- ${tool.name}: ${tool.description}`),
      'Você também pode pedir em linguagem natural, por exemplo: "buscar workspace acme".',
    ].join('\n');
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

const ACTIVE_RESPONSE =
  'Assistente administrativo ativo. Hoje eu já consigo consultar ferramentas diretas do painel. ' +
  'Use /list para ver o catálogo disponível ou peça algo como "buscar workspace acme".';

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

function inferToolInvocation(
  content: string,
): { name: string; args: Record<string, unknown> } | null {
  const trimmed = content.trim();
  const explicitSearch = trimmed.match(
    /(?:buscar|procurar|encontrar)\s+(?:workspace|conta|produtor|cliente)\s+(.+)/i,
  );
  if (explicitSearch?.[1]) {
    return { name: 'searchWorkspaces', args: { query: explicitSearch[1].trim() } };
  }

  const contextualSearch = trimmed.match(/(?:workspace|conta|produtor|cliente)\s+(.+)/i);
  if (contextualSearch?.[1] && contextualSearch[1].trim().length >= 2) {
    return { name: 'searchWorkspaces', args: { query: contextualSearch[1].trim() } };
  }

  return null;
}

function summarizeToolResult(toolName: string, result: Record<string, unknown>): string {
  if (toolName === 'searchWorkspaces') {
    const items = Array.isArray(result.items) ? result.items : [];
    if (items.length === 0) {
      return 'Nenhuma workspace encontrada para o termo informado.';
    }

    return [
      `Encontrei ${items.length} workspace(s):`,
      ...items.slice(0, 5).map((item) => {
        const row = item as Record<string, unknown>;
        const name = typeof row.name === 'string' ? row.name : 'Sem nome';
        const id = typeof row.id === 'string' ? row.id : 'sem-id';
        return `- ${name} (${id})`;
      }),
    ].join('\n');
  }

  const preview = JSON.stringify(result, null, 2);
  return preview.length > 1800 ? `${preview.slice(0, 1800)}…` : preview;
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
