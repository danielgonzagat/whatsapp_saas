import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { actionImportContacts as actionImportContactsCompanion } from './__companions__/unified-agent-actions-crm.service.companion';
import { flowQueue } from '../queue/queue';
import { WhatsAppProviderRegistry } from '../whatsapp/providers/provider-registry';
import type { ToolArgs } from './unified-agent.service';
import { OpsAlertService } from '../observability/ops-alert.service';

type UnknownRecord = Record<string, unknown>;

/**
 * Handles CRM tool actions: lead status updates, tags, follow-ups, human transfer,
 * knowledge base search, flow triggers, and event logging.
 */
@Injectable()
export class UnifiedAgentActionsCrmService {
  private readonly logger = new Logger(UnifiedAgentActionsCrmService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: WhatsAppProviderRegistry,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  // ───────── helpers ─────────

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  str(v: unknown, fb = ''): string {
    return typeof v === 'string'
      ? v
      : typeof v === 'number' || typeof v === 'boolean'
        ? String(v)
        : fb;
  }

  num(v: unknown, fb = 0): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : fb;
  }

  private hasAutonomyExecutionClient(
    value: unknown,
  ): value is { autonomyExecution: PrismaService['autonomyExecution'] } {
    return (
      this.isRecord(value) &&
      'autonomyExecution' in value &&
      value.autonomyExecution !== null &&
      value.autonomyExecution !== undefined
    );
  }

  // ───────── CRM actions ─────────

  async actionUpdateLeadStatus(workspaceId: string, contactId: string, args: ToolArgs) {
    if (!contactId) return { success: false, error: 'No contact ID' };
    const statusVal = this.str(args.status);
    const intentVal = this.str(args.intent);
    await this.prisma.$transaction(
      async (tx) => {
        await tx.contact.updateMany({
          where: { id: contactId, workspaceId },
          data: {
            nextBestAction: statusVal || intentVal || undefined,
            aiSummary: intentVal ? `Intent: ${intentVal}` : undefined,
            updatedAt: new Date(),
          },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
    return { success: true, status: statusVal };
  }

  async actionAddTag(workspaceId: string, contactId: string, args: ToolArgs) {
    if (!contactId) return { success: false, error: 'No contact ID' };
    const tagName = this.str(args.tag);
    await this.prisma.$transaction(
      async (tx) => {
        let tag = await tx.tag.findFirst({ where: { workspaceId, name: tagName } });
        if (!tag) {
          tag = await tx.tag.create({ data: { name: tagName, workspaceId, color: '#3B82F6' } });
        }
        const contact = await tx.contact.findFirst({
          where: { id: contactId, workspaceId },
          select: { phone: true },
        });
        if (!contact?.phone) return;
        await tx.contact.update({
          where: { workspaceId_phone: { workspaceId, phone: contact.phone } },
          data: { tags: { connect: { id: tag.id } } },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
    return { success: true, tag: tagName };
  }

  async actionScheduleFollowup(
    workspaceId: string,
    contactId: string,
    _phone: string,
    args: ToolArgs,
  ) {
    try {
      const delayHours = this.num(args.delayHours, 24);
      const scheduledFor = new Date(Date.now() + delayHours * 60 * 60 * 1000);
      const followMessage = this.str(args.message);
      const followReason = this.str(args.reason, 'scheduled_by_unified_agent');
      const followFlowId = this.str(args.flowId) || null;

      this.logger.log(`[AGENT] Follow-up agendado para ${_phone} em ${delayHours}h`);
      await this.prisma.followUp.create({
        data: {
          workspaceId,
          contactId,
          scheduledFor,
          message: followMessage,
          reason: followReason,
          flowId: followFlowId,
          status: 'pending',
        },
      });
      await this.prisma.autopilotEvent
        .create({
          data: {
            workspaceId,
            contactId,
            intent: 'FOLLOWUP',
            action: 'SCHEDULE_FOLLOWUP',
            status: 'scheduled',
            reason: `Agendado para ${scheduledFor.toISOString()}`,
            responseText: followMessage,
            meta: { scheduledFor: scheduledFor.toISOString(), delayHours },
          },
        })
        .catch(() => {});

      return {
        success: true,
        scheduledFor: scheduledFor.toISOString(),
        message: followMessage,
        jobId: `followup_${workspaceId}_${contactId}_${scheduledFor.getTime()}`,
      };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'UnifiedAgentActionsCrmService.getTime');
      const msg =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown';
      this.logger.error(`Erro ao agendar follow-up: ${msg}`);
      return { success: false, error: msg };
    }
  }

  async actionTransferToHuman(workspaceId: string, contactId: string, args: ToolArgs) {
    const reason = this.str(args.reason, 'Not specified');
    const priority = this.str(args.priority, 'normal');
    if (contactId) {
      await this.prisma.$transaction(
        async (tx) => {
          const latestConversation = await tx.conversation.findFirst({
            where: { workspaceId, contactId },
            orderBy: [{ updatedAt: 'desc' }],
            select: { id: true },
          });
          if (latestConversation) {
            await tx.conversation.updateMany({
              where: { id: latestConversation.id, workspaceId },
              data: { mode: 'HUMAN' },
            });
          }
          await tx.contact.updateMany({
            where: { id: contactId, workspaceId },
            data: {
              nextBestAction: 'HUMAN_NEEDED',
              aiSummary: `Transfer reason: ${reason}`,
              updatedAt: new Date(),
            },
          });
          const txUnknown: unknown = tx;
          if (this.hasAutonomyExecutionClient(txUnknown)) {
            await txUnknown.autonomyExecution
              .create({
                data: {
                  workspaceId,
                  contactId,
                  conversationId: latestConversation?.id || null,
                  idempotencyKey: `transfer-human:${workspaceId}:${contactId}:${reason.slice(0, 120) || 'generic'}`,
                  actionType: 'TRANSFER_HUMAN',
                  request: { reason, priority },
                  response: {
                    lockedConversationId: latestConversation?.id || null,
                    status: 'success',
                  },
                  status: 'SUCCESS',
                },
              })
              .catch((err: unknown) =>
                this.logger.warn(
                  'Failed to create autopilot event for transfer: ' +
                    (err instanceof Error ? err.message : this.str(err)),
                ),
              );
          }
        },
        { isolationLevel: 'ReadCommitted' },
      );
    }
    return { success: true, reason, priority };
  }

  async actionSearchKnowledgeBase(workspaceId: string, args: ToolArgs) {
    const query = this.str(args.query);
    const results = await this.prisma.kloelMemory.findMany({
      where: {
        workspaceId,
        OR: [
          { key: { contains: query.toLowerCase() } },
          { value: { path: ['$'], string_contains: query.toLowerCase() } },
        ],
      },
      select: { id: true, key: true, value: true, category: true },
      take: 5,
    });
    return { success: true, results: results.map((r) => ({ key: r.key, value: r.value })) };
  }

  async actionTriggerFlow(workspaceId: string, phone: string, args: ToolArgs) {
    try {
      const flowIdVal = this.str(args.flowId) || this.str(args.flowName);
      const flowNameVal = this.str(args.flowName);
      let flow = flowIdVal
        ? await this.prisma.flow.findFirst({ where: { id: flowIdVal, workspaceId } })
        : null;
      if (!flow && flowNameVal) {
        flow = await this.prisma.flow.findFirst({
          where: {
            workspaceId,
            name: { contains: flowNameVal, mode: 'insensitive' },
            isActive: true,
          },
        });
      }
      if (!flow) return { success: false, error: 'Fluxo não encontrado' };
      await flowQueue.add('run-flow', {
        workspaceId,
        flowId: flow.id,
        user: phone,
        initialVars: (args.variables as UnknownRecord) || {},
        triggeredBy: 'kloel-agent',
      });
      this.logger.log(`[AGENT] Fluxo "${flow.name}" disparado para ${phone}`);
      return { success: true, flowId: flow.id, flowName: flow.name, triggered: true };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        error,
        'UnifiedAgentActionsCrmService.actionTriggerFlow',
      );
      const msg =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown';
      this.logger.error(`Erro ao disparar fluxo: ${msg}`);
      return { success: false, error: msg };
    }
  }

  async actionLogEvent(workspaceId: string, contactId: string, args: ToolArgs) {
    const eventName = this.str(args.event);
    const properties = (args.properties ?? {}) as Record<string, string | number | boolean | null>;
    try {
      await this.prisma.autopilotEvent.create({
        data: {
          workspaceId,
          contactId,
          intent: eventName,
          action: 'LOG_EVENT',
          status: 'completed',
          meta: properties,
        },
      });
    } catch (err: unknown) {
      void this.opsAlert?.alertOnCriticalError(err, 'UnifiedAgentActionsCrmService.create');
      const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : 'unknown';
      const isTestEnv = !!process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test';
      if (!isTestEnv) {
        const code = (err as { code?: string } | null)?.code;
        if (code === 'P2003')
          this.logger.debug(`Skipping autopilot event log due to FK (contactId=${contactId})`);
        else this.logger.warn(`Failed to log event: ${msg}`);
      }
    }
    return { success: true, event: eventName };
  }

  async actionConnectWhatsApp(workspaceId: string, _args: ToolArgs) {
    try {
      const provider = 'meta-cloud';
      await this.prisma.$transaction(
        async (tx) => {
          const workspace = await tx.workspace.findUnique({
            where: { id: workspaceId },
            select: { providerSettings: true },
          });
          const current = (workspace?.providerSettings ?? {}) as UnknownRecord;
          await tx.workspace.update({
            where: { id: workspaceId },
            data: {
              providerSettings: {
                ...current,
                whatsappProvider: provider,
                connectionStatus: 'connecting',
                connectionInitiatedAt: new Date().toISOString(),
              },
            },
          });
        },
        { isolationLevel: 'ReadCommitted' },
      );
      const session = await this.providerRegistry.startSession(workspaceId);
      this.logger.log(`[AGENT] Sessão WhatsApp criada para ${workspaceId}`);
      return {
        success: session.success,
        message: session.message || 'Conexão oficial com a Meta iniciada.',
        sessionId: workspaceId,
        provider,
        authUrl: session.authUrl,
        nextStep: 'Conclua a autorização oficial da Meta para ativar o canal.',
      };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'UnifiedAgentActionsCrmService.async');
      const msg =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown';
      this.logger.error(`Erro ao conectar WhatsApp: ${msg}`);
      return {
        success: false,
        error: msg,
        nextStep: 'Tente novamente ou acesse /whatsapp para conectar manualmente',
      };
    }
  }

  async actionImportContacts(workspaceId: string, args: ToolArgs) {
    return actionImportContactsCompanion(this.prisma, workspaceId, args);
  }
}
