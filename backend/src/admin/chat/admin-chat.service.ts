import { Injectable, Logger, Optional } from '@nestjs/common';
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
import { OpsAlertService } from '../../observability/ops-alert.service';
import { MindObservabilityService } from '../../kloel/mind/observability/mind-observability.service';
import {
  inferToolInvocation,
  parseToolInvocation,
  summarizeToolResult,
  toSessionView,
} from './admin-chat.helpers';
import type { ChatSessionView, SendMessageInput } from './admin-chat.helpers';
import { SpineEmitterService } from '../../kloel/spine/spine-emitter.service';
import { DecisionOutcomeService } from '../../kloel/decision-outcome.service';
import { MindBeliefService } from '../../kloel/mind/inference/mind-belief.service';
import { MindSurpriseService } from '../../kloel/mind/inference/mind-surprise.service';
import { buildMindSignals } from '../../kloel/mind/build-mind-signals.helper';
import {
  buildChatOutcomeKey,
  recordChatReplyDecision,
  closeChatReplyOutcome,
  observeRepliedToUserBelief,
  computeChatSurprise,
} from '../../kloel/kloel-reply-engine.decision-outcome.helpers';

const LIST_RE = /^\/list\b/i;

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 4000;
const ADMIN_CHAT_WORKSPACE_ID = '__admin__';

const ACTIVE_RESPONSE =
  'Assistente administrativo ativo. Hoje eu já consigo consultar ferramentas diretas do painel. ' +
  'Use /list para ver o catálogo disponível ou peça algo como "buscar workspace acme".';

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
    @Optional() private readonly opsAlert?: OpsAlertService,
    @Optional() private readonly mindObservability?: MindObservabilityService,
    @Optional() private readonly spine?: SpineEmitterService,
    @Optional() private readonly decisionOutcomeService?: DecisionOutcomeService,
    @Optional() private readonly mindBeliefService?: MindBeliefService,
    @Optional() private readonly mindSurpriseService?: MindSurpriseService,
  ) {}

  /** Send message. */
  async sendMessage(input: SendMessageInput): Promise<ChatSessionView> {
    const startedAt = Date.now();
    if (input.content.length > MAX_MESSAGE_LENGTH) {
      throw adminErrors.forbidden();
    }

    const session = await this.ensureSession(input.adminUserId, input.sessionId);
    const workspaceId = session.workspaceId;

    // PI-K19-B: record decision outcome at start of every admin chat reply
    const outcomeKey = buildChatOutcomeKey(workspaceId);
    if (outcomeKey) {
      recordChatReplyDecision(this.decisionOutcomeService, this.logger, {
        workspaceId,
        outcomeKey,
        surface: 'admin',
        messageLength: input.content.length,
      });
    }

    // PI-K19-B: build mind signals (fire-and-forget)
    void (async () => {
      try {
        await buildMindSignals(
          { prisma: this.prisma, logger: this.logger },
          workspaceId,
          input.content,
        );
      } catch {
        /* fire-and-forget */
      }
    })();

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

    await this.prisma.adminChatSession.updateMany({
      where: { id: session.id, workspaceId: session.workspaceId },
      data: { lastUsedAt: new Date() },
    });

    // PI-K19-B: cognition.decision_made emission (fire-and-forget)
    void (async () => {
      if (this.spine) {
        try {
          await this.spine.emit({
            eventName: 'cognition.decision_made',
            workspaceId,
            truthMode: 'observed',
            provenance: {
              source: 'production',
              processor: 'admin-chat-service',
              processorVersion: '1.0.0',
              schemaVersion: '1.0.0',
            },
            payload: {
              surface: 'admin',
              toolCallsCount: 0,
              fallbackReason: null,
              durationMs: Date.now() - startedAt,
            },
          });
        } catch (err: unknown) {
          this.logger.warn('admin_chat_cognition_event_skipped', {
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }
    })();

    // PI-K19-B: observe belief + compute surprise
    observeRepliedToUserBelief(this.mindBeliefService, this.logger, {
      workspaceId,
      surface: 'admin',
      observed: 1,
    });
    void computeChatSurprise(
      this.mindSurpriseService,
      this.mindBeliefService,
      this.logger,
      {
        workspaceId,
        observed: 1,
        surface: 'admin',
        degraded: false,
      },
    );

    // PI-K19-B: close decision outcome
    closeChatReplyOutcome(this.decisionOutcomeService, this.logger, {
      outcomeKey,
      outcomeName: 'chat.replied',
      wonVsBaseline: true,
    });

    void this.observeReplyFireAndForget(session.workspaceId, startedAt);

    return this.loadSessionView(session.id, session.workspaceId);
  }

  /** Fire-and-forget observability helper. */
  private observeReplyFireAndForget(workspaceId: string, startedAt: number): void {
    if (!this.mindObservability) {
      return;
    }
    try {
      this.mindObservability.observeReply(workspaceId, {
        surface: 'admin',
        durationMs: Date.now() - startedAt,
        success: true,
      });
    } catch {
      // fire-and-forget: never throw from metrics
    }
  }

  /** List sessions. */
  async listSessions(adminUserId: string, workspaceId?: string): Promise<ChatSessionView[]> {
    const sessions = await this.prisma.adminChatSession.findMany({
      where: {
        adminUserId,
        expiresAt: { gt: new Date() },
        ...(workspaceId ? { workspaceId } : {}),
      },
      orderBy: { lastUsedAt: 'desc' },
      take: 20,
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    return sessions.map(toSessionView);
  }

  /** Get session. */
  async getSession(
    adminUserId: string,
    sessionId: string,
    workspaceId?: string,
  ): Promise<ChatSessionView> {
    const session = await this.prisma.adminChatSession.findFirst({
      where: {
        id: sessionId,
        adminUserId,
        workspaceId: workspaceId ?? { not: '' },
      },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!session) {
      throw adminErrors.forbidden();
    }
    return toSessionView(session);
  }

  // ---- internals ----------------------------------------------------------

  private async ensureSession(adminUserId: string, sessionId: string | null, workspaceId?: string) {
    if (sessionId) {
      const existing = await this.prisma.adminChatSession.findFirst({
        where: {
          id: sessionId,
          adminUserId,
          workspaceId: workspaceId ?? { not: '' },
          expiresAt: { gt: new Date() },
        },
      });
      if (existing) {
        return existing;
      }
    }
    return this.prisma.adminChatSession.create({
      data: {
        adminUserId,
        workspaceId: workspaceId ?? ADMIN_CHAT_WORKSPACE_ID,
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
      result = await tool.execute(call.args, { adminUserId, adminRole });
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'AdminChatService.execute');
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
          },
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
      'Você também pode pedir em linguagem natural, por exemplo: "buscar workspace acme" ou "me mostra o overview de marketing".',
    ].join('\n');
  }

  private async loadSessionView(sessionId: string, workspaceId: string): Promise<ChatSessionView> {
    const session = await this.prisma.adminChatSession.findFirst({
      where: { id: sessionId, workspaceId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!session) {
      throw adminErrors.forbidden();
    }
    return toSessionView(session);
  }
}

// Silence unused-import lints if this file is the last consumer in a
// future split — the imported types are part of the public surface.
export type { AdminAction, AdminModule };
