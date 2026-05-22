import { Injectable, Optional } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { PrismaService } from '../prisma/prisma.service';
import { actionImportContacts as actionImportContactsCompanion } from './unified-agent-actions-crm.helpers';
import { flowQueue } from '../queue/queue';
import { WhatsAppProviderRegistry } from '../whatsapp/providers/provider-registry';
import type { ToolArgs } from './unified-agent.types';
import { OpsAlertService } from '../observability/ops-alert.service';
import { TAG_DEFAULT_COLORS } from '../common/kloel-colors';
import { MindGuardContextBuilderService } from './mind-guard-context-builder.service';
import { MindGuardsService } from './mind-guards.service';
import type { MindActionContext } from './mind-code-native.types';
import { MindPolicyService } from './mind-policy.service';
import { MindService } from './mind.service';
import {
  chooseFollowUpTiming,
  predecidedFollowUpTiming,
  predecidedHumanTransfer,
} from './unified-agent-actions-crm-predecided.helpers';

import type { UnknownRecord } from '../common/types';

function isDeterministicPipeline(context?: UnknownRecord): boolean {
  return context?.deterministicPipeline === true;
}

/**
 * Handles CRM tool actions: lead status updates, tags, follow-ups, human transfer,
 * knowledge base search, flow triggers, and event logging.
 */
@Injectable()
export class UnifiedAgentActionsCrmService {
  private readonly logger = StructuredLogger.from(UnifiedAgentActionsCrmService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: WhatsAppProviderRegistry,
    @Optional() private readonly opsAlert?: OpsAlertService,
    @Optional() private readonly mindPolicy?: MindPolicyService,
    @Optional() private readonly mind?: MindService,
    @Optional() private readonly guardContextBuilder?: MindGuardContextBuilderService,
    @Optional() private readonly guards?: MindGuardsService,
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
    if (!contactId) {
      return { success: false, error: 'No contact ID' };
    }
    const statusVal = this.str(args.status);
    const intentVal = this.str(args.intent);
    await this.prisma.$transaction(
      async (tx) => {
        await tx.contact.updateMany({
          where: { id: contactId, workspaceId },
          data: {
            ...(statusVal || intentVal ? { nextBestAction: statusVal || intentVal } : {}),
            ...(intentVal ? { aiSummary: `Intent: ${intentVal}` } : {}),
            updatedAt: new Date(),
          },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
    return { success: true, status: statusVal };
  }

  async actionAddTag(workspaceId: string, contactId: string, args: ToolArgs) {
    if (!contactId) {
      return { success: false, error: 'No contact ID' };
    }
    const tagName = this.str(args.tag);
    await this.prisma.$transaction(
      async (tx) => {
        let tag = await tx.tag.findFirst({ where: { workspaceId, name: tagName } });
        if (!tag) {
          tag = await tx.tag.create({
            data: { name: tagName, workspaceId, color: TAG_DEFAULT_COLORS.CRM_AUTO_BLUE },
          });
        }
        const contact = await tx.contact.findFirst({
          where: { id: contactId, workspaceId },
          select: { phone: true },
        });
        if (!contact?.phone) {
          return;
        }
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
    context?: UnknownRecord,
  ) {
    try {
      const requestedDelayHours = this.num(args.delayHours, 24);
      const resolvedChannel = await this.resolveChannel(workspaceId, _phone);
      const predecided = isDeterministicPipeline(context);
      const mindDecision = predecided
        ? predecidedFollowUpTiming(args, requestedDelayHours)
        : await chooseFollowUpTiming({
            workspaceId,
            contactId,
            channel: resolvedChannel,
            logger: this.logger,
            ...(this.mindPolicy !== undefined ? { mindPolicy: this.mindPolicy } : {}),
            requestedDelayHours,
          });
      const delayHours = mindDecision.delayHours;
      const scheduledFor = new Date(Date.now() + delayHours * 60 * 60 * 1000);
      const followMessage = this.str(args.message);
      const followReason = this.str(args.reason, 'scheduled_by_unified_agent');
      const followFlowId = this.str(args.flowId) || null;

      const existing = await this.prisma.followUp.findFirst({
        where: {
          workspaceId,
          contactId,
          reason: followReason,
          status: 'pending',
          scheduledFor: { gte: new Date(Date.now() - 5 * 60 * 1000) },
        },
        select: { id: true, scheduledFor: true },
      });
      if (existing) {
        return {
          success: true,
          scheduledFor: existing.scheduledFor.toISOString(),
          message: followMessage,
          jobId: `followup_${workspaceId}_${contactId}_${existing.scheduledFor.getTime()}`,
          deduplicated: true,
        };
      }

      this.logger.log(
        `[AGENT] Follow-up agendado para ${_phone} em ${delayHours}h (channel=${resolvedChannel})`,
      );
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
            meta: {
              scheduledFor: scheduledFor.toISOString(),
              delayHours,
              channel: resolvedChannel,
              decisionTraceId: args.decisionTraceId,
              inboundCorrelationId: args.inboundCorrelationId,
              mind: mindDecision.meta,
              source: predecided ? 'orchestrator_predecided' : 'legacy_action_decision',
            },
          },
        })
        .catch(() => {});

      return {
        success: true,
        scheduledFor: scheduledFor.toISOString(),
        message: followMessage,
        jobId: `followup_${workspaceId}_${contactId}_${scheduledFor.getTime()}`,
        mind: mindDecision.meta,
      };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'UnifiedAgentActionsCrmService.getTime');
      const msg =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown';
      this.logger.error(`Erro ao agendar follow-up: ${msg}`);
      return { success: false, error: msg };
    }
  }

  private async resolveChannel(workspaceId: string, phone: string): Promise<string> {
    try {
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
          providerSettings: true,
          channelIdentifiers: {
            where: { channel: 'WHATSAPP' },
            select: { value: true },
            take: 1,
          },
        },
      });
      const settings = (workspace?.providerSettings ?? {}) as UnknownRecord;
      const whatsappProvider = settings.whatsappProvider;
      const connectionStatus = settings.connectionStatus;

      if (typeof whatsappProvider === 'string' && connectionStatus === 'connected') {
        return 'whatsapp';
      }

      const hasWhatsappChannel = (workspace?.channelIdentifiers?.length ?? 0) > 0;

      if (phone && phone.startsWith('+') && hasWhatsappChannel) {
        return 'whatsapp';
      }

      return 'email';
    } catch {
      return phone && phone.startsWith('+') ? 'whatsapp' : 'email';
    }
  }

  async actionTransferToHuman(
    workspaceId: string,
    contactId: string,
    args: ToolArgs,
    context?: UnknownRecord,
  ) {
    const reason = this.str(args.reason, 'Not specified');
    const priority = this.str(args.priority, 'normal');
    const predecided = isDeterministicPipeline(context);
    const handoff = predecided
      ? predecidedHumanTransfer(args)
      : await this.chooseHumanTransfer(workspaceId, reason, priority);
    if (handoff.action === 'continue_ai' || handoff.action === 'pause_wait') {
      await this.prisma.autopilotEvent
        .create({
          data: {
            workspaceId,
            contactId,
            intent: 'HUMAN_TRANSFER',
            action: 'TRANSFER_SKIPPED_BY_MIND',
            status: 'completed',
            meta: {
              reason,
              priority,
              handoff,
              decisionTraceId: args.decisionTraceId,
              inboundCorrelationId: args.inboundCorrelationId,
              source: predecided ? 'orchestrator_predecided' : 'legacy_action_decision',
            },
          },
        })
        .catch(() => {});
      return { success: true, transferred: false, reason, priority, mind: handoff };
    }
    const transferContext = await this.buildTransferGuardContext(workspaceId, {
      contactId,
      humanAvailable: true,
      priority,
      reason,
    });
    const guard = await this.guards?.evaluate({
      workspaceId,
      decisionType: 'human_transfer',
      action: 'human_escalation',
      context: transferContext,
    });
    if (guard && !guard.allowed) {
      return {
        success: false,
        blocked: true,
        transferred: false,
        reason: guard.reason,
        guardName: guard.guardName,
        mind: handoff,
      };
    }
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
    return { success: true, reason, priority, transferred: true, mind: handoff };
  }

  private async buildTransferGuardContext(
    workspaceId: string,
    context: MindActionContext,
  ): Promise<MindActionContext> {
    return (await this.guardContextBuilder?.buildForTransfer(workspaceId, context)) ?? context;
  }

  private async chooseHumanTransfer(
    workspaceId: string,
    reason: string,
    priority: string,
  ): Promise<{ action: string; confidence?: number; fallback?: boolean }> {
    if (!this.mind) {
      return { action: 'transfer_now' };
    }
    try {
      const ticketRisk = priority === 'urgent' || priority === 'high' ? 0.8 : 0.35;
      return await this.mind.resolveHumanTransfer(workspaceId, 'agent', reason, ticketRisk);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : this.str(error, 'unknown');
      this.logger.warn(`MIND human transfer fallback: ${msg}`);
      return { action: 'transfer_now' };
    }
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
      if (!flow) {
        return { success: false, error: 'Fluxo não encontrado' };
      }
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
        if (code === 'P2003') {
          this.logger.debug(`Skipping autopilot event log due to FK (contactId=${contactId})`);
        } else {
          this.logger.warn(`Failed to log event: ${msg}`);
        }
      }
    }
    return { success: true, event: eventName };
  }

  async actionConnectWhatsApp(workspaceId: string, _args: ToolArgs) {
    try {
      const provider = 'meta-cloud';
      const existing = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { providerSettings: true },
      });
      const current = (existing?.providerSettings ?? {}) as UnknownRecord;
      if (current.whatsappProvider === provider && current.connectionStatus === 'connected') {
        return {
          success: true,
          message: 'WhatsApp já está conectado.',
          sessionId: workspaceId,
          provider,
          deduplicated: true,
        };
      }

      await this.prisma.$transaction(
        async (tx) => {
          const workspace = await tx.workspace.findUnique({
            where: { id: workspaceId },
            select: { providerSettings: true },
          });
          const latest = (workspace?.providerSettings ?? {}) as UnknownRecord;
          await tx.workspace.update({
            where: { id: workspaceId },
            data: {
              providerSettings: {
                ...latest,
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
