import { Injectable, Optional } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { PrismaService } from '../prisma/prisma.service';
import { formatBrlAmount } from './money-format.util';
import { UnifiedAgentActionsMessagingService } from './unified-agent-actions-messaging.service';
import type { ToolArgs } from './unified-agent.types';
import { OpsAlertService } from '../observability/ops-alert.service';
import {
  actionHandleObjection as actionHandleObjectionFn,
  antiChurnMessage,
  clampDiscountPercent,
  describeUnknownError,
  discountPercentFromMind,
  getStagePurchaseProbabilityBucket,
  isDeterministicPipeline,
  isRecord,
  MEETING_TYPE_LABELS,
  priceBandFor,
  REACTIVATION_MESSAGES,
  toJsonValue,
} from './unified-agent-actions-sales.service.helpers';
import { MindGuardContextBuilderService } from './mind/policy/mind-guard-context-builder.service';
import { MindGuardsService } from './mind/policy/mind-guards.service';
import type { MindActionContext } from './mind/policy/mind-code-native.types';
import { MindService } from './mind.service';

import type { UnknownRecord } from '../common/types';

import { readStringOr as readString } from '../common/parse';
import { MindMemoryItemService } from './mind/aliases/mind-memory-item.service';

/**
 * Handles sales/negotiation tool actions: discount, objection handling,
 * lead qualification, meeting scheduling, anti-churn, and ghost reactivation.
 */
@Injectable()
export class UnifiedAgentActionsSalesService {
  private readonly logger = StructuredLogger.from(UnifiedAgentActionsSalesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: UnifiedAgentActionsMessagingService,
    @Optional() private readonly opsAlert?: OpsAlertService,
    @Optional() private readonly mind?: MindService,
    @Optional() private readonly guardContextBuilder?: MindGuardContextBuilderService,
    @Optional() private readonly guards?: MindGuardsService,
    @Optional() private readonly mindMemory?: MindMemoryItemService,
  ) {}

  /** Canonical Brain → Mind memory delegate (raw-Prisma fallback). */
  private get mindMemoryItems(): PrismaService['kloelMemory'] {
    return this.mindMemory?.items ?? this.prisma.kloelMemory;
  }

  async actionApplyDiscount(
    workspaceId: string,
    contactId: string,
    phone: string,
    args: ToolArgs,
    context?: UnknownRecord,
  ) {
    try {
      const requestedDiscountPercent = clampDiscountPercent(args?.discountPercent);
      const reason = args?.reason || 'Oferta especial';
      const expiresIn = args?.expiresIn || '24h';
      const recentMemory = await this.mindMemoryItems.findFirst({
        where: { workspaceId, category: 'products' },
        orderBy: { createdAt: 'desc' },
      });
      let originalPrice = 0;
      let productName = 'produto';
      if (recentMemory?.value) {
        const productData: unknown =
          typeof recentMemory.value === 'string'
            ? JSON.parse(recentMemory.value)
            : recentMemory.value;
        originalPrice = ((productData as UnknownRecord).price as number) || 0;
        productName = ((productData as UnknownRecord).name as string) || 'produto';
      }
      const predecided = isDeterministicPipeline(context);
      const segment = readString(
        args.segment,
        readString(context?.segment, readString(args.stage, 'general')),
      );
      const priceBand = readString(args.priceBand, priceBandFor(originalPrice));
      const productOffer = predecided
        ? args.productOffer
        : this.mind
          ? await this.mind.resolveProductOffer(workspaceId, segment, 'discount', priceBand)
          : null;
      const couponDecision = predecided
        ? args.couponDecision
        : this.mind
          ? await this.mind.resolveCoupon(workspaceId, priceBand, 0, segment)
          : null;
      const couponAction = isRecord(couponDecision)
        ? readString(couponDecision.action, '')
        : undefined;
      const metaSource = predecided ? 'orchestrator_predecided' : 'legacy_action_decision';
      const couponJson = toJsonValue(couponDecision);
      const productJson = toJsonValue(productOffer);
      if (couponAction === 'no_coupon' || couponAction === 'human_negotiate') {
        await this.prisma.autopilotEvent.create({
          data: {
            workspaceId,
            contactId,
            intent: 'NEGOTIATION',
            action:
              couponAction === 'human_negotiate'
                ? 'DISCOUNT_HUMAN_NEGOTIATION'
                : 'DISCOUNT_SKIPPED',
            status: 'completed',
            meta: {
              priceBand,
              productOffer: productJson,
              couponDecision: couponJson,
              decisionTraceId: args.decisionTraceId || null,
              inboundCorrelationId: args.inboundCorrelationId || null,
              source: metaSource,
            },
          },
        });
        return {
          success: true,
          discountApplied: false,
          messageSent: false,
          mind: { couponDecision, productOffer },
        };
      }
      const discountPercent = discountPercentFromMind(couponAction, requestedDiscountPercent);
      const discountContext = await this.buildDiscountGuardContext(workspaceId, {
        ...(context || {}),
        contactId,
        discountPercent,
        maxDiscountPercent: 30,
        minMarginPercent: 0,
        productName,
      });
      const guard = await this.guards?.evaluate({
        workspaceId,
        decisionType: 'coupon_offer',
        action: 'apply_discount',
        context: discountContext,
      });
      if (guard && !guard.allowed) {
        return {
          success: false,
          blocked: true,
          discountApplied: false,
          messageSent: false,
          reason: guard.reason,
          guardName: guard.guardName,
        };
      }
      const finalPrice = originalPrice * (1 - discountPercent / 100);
      await this.prisma.autopilotEvent.create({
        data: {
          workspaceId,
          contactId,
          intent: 'NEGOTIATION',
          action: 'DISCOUNT_APPLIED',
          status: 'executed',
          meta: {
            discountPercent,
            reason,
            expiresIn,
            originalPrice,
            finalPrice,
            productName,
            priceBand,
            decisionTraceId: args.decisionTraceId || null,
            inboundCorrelationId: args.inboundCorrelationId || null,
            mind: { couponDecision: couponJson, productOffer: productJson },
            source: metaSource,
          },
        },
      });
      const priceFormatted = formatBrlAmount(finalPrice);
      const message = [
        'Oferta comercial para você',
        '',
        `Consegui um desconto exclusivo de *${discountPercent}%* para você!`,
        '',
        `De: ${formatBrlAmount(originalPrice)}`,
        `Por apenas: ${priceFormatted}`,
        '',
        reason,
        `Válido por ${expiresIn}. Aproveite!`,
      ].join('\n');
      // messageLimit: enforced via PlanLimitsService.trackMessageSend
      await this.messaging.actionSendMessage(workspaceId, phone, { message }, context);
      return {
        success: true,
        discountPercent,
        originalPrice,
        finalPrice,
        expiresIn,
        messageSent: true,
      };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        error,
        'UnifiedAgentActionsSalesService.actionSendMessage',
      );
      const msg =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown';
      this.logger.error(`Erro ao aplicar desconto: ${msg}`);
      return { success: false, error: msg };
    }
  }

  private async buildDiscountGuardContext(
    workspaceId: string,
    context: MindActionContext,
  ): Promise<MindActionContext> {
    return (await this.guardContextBuilder?.buildForDiscount(workspaceId, context)) ?? context;
  }

  async actionHandleObjection(
    workspaceId: string,
    contactId: string,
    phone: string,
    args: ToolArgs,
    context?: UnknownRecord,
  ) {
    if (this.mind && !isDeterministicPipeline(context)) {
      try {
        const segment = readString(context?.segment, readString(args.stage, 'general'));
        const concept = readString(args.objectionType, 'objection');
        await this.mind.resolveProductOffer(workspaceId, segment, concept, 'unknown');
      } catch (error: unknown) {
        const msg = describeUnknownError(error);
        this.logger.warn(`MIND product offer fallback for objection: ${msg}`);
      }
    }
    return actionHandleObjectionFn({
      workspaceId,
      contactId,
      phone,
      args,
      context,
      prisma: this.prisma,
      mindMemory: this.mindMemoryItems,
      messaging: this.messaging,
      logger: this.logger,
      ...(this.opsAlert !== undefined ? { opsAlert: this.opsAlert } : {}),
    });
  }

  async actionQualifyLead(
    workspaceId: string,
    contactId: string,
    phone: string,
    args: ToolArgs,
    context?: UnknownRecord,
  ) {
    try {
      const questions = args?.questions || [
        'Qual o principal desafio que você enfrenta hoje?',
        'Você já tentou resolver isso antes?',
        'Qual seria o resultado ideal para você?',
      ];
      const stage = args?.stage || 'interest';
      await this.prisma.contact
        .update({
          where: { id: contactId },
          data: { purchaseProbability: getStagePurchaseProbabilityBucket(stage) },
        })
        .catch((err: unknown) => {
          const errStr = describeUnknownError(err);
          this.logger.warn(`Failed to update contact purchaseProbability: ${errStr}`);
        });
      const message = `Para te ajudar melhor, preciso entender algumas coisas:\n\n${questions[0]}`;
      await this.prisma.autopilotEvent.create({
        data: {
          workspaceId,
          contactId,
          intent: 'QUALIFICATION',
          action: 'QUALIFY_STARTED',
          status: 'executed',
          meta: { stage, questionsCount: questions.length },
        },
      });
      // messageLimit: enforced via PlanLimitsService.trackMessageSend
      await this.messaging.actionSendMessage(workspaceId, phone, { message }, context);
      return {
        success: true,
        stage,
        questionsAsked: 1,
        totalQuestions: questions.length,
        messageSent: true,
      };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        error,
        'UnifiedAgentActionsSalesService.actionSendMessage',
      );
      const msg =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown';
      this.logger.error(`Erro ao qualificar lead: ${msg}`);
      return { success: false, error: msg };
    }
  }

  async actionScheduleMeeting(
    workspaceId: string,
    contactId: string,
    phone: string,
    args: ToolArgs,
    context?: UnknownRecord,
  ) {
    try {
      const isTestEnv = !!process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test';
      const meetingType = args?.type || 'demo';
      const suggestedTimes = args?.suggestedTimes || [
        'Amanhã às 10h',
        'Amanhã às 15h',
        'Sexta às 14h',
      ];
      const message = `${MEETING_TYPE_LABELS[meetingType] || 'Agendamento'}\n\nQual horário funciona melhor para você?\n\n${suggestedTimes.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n')}\n\nOu me diga um horário de sua preferência!`;
      try {
        await this.prisma.autopilotEvent.create({
          data: {
            workspaceId,
            contactId,
            intent: 'SCHEDULING',
            action: 'MEETING_PROPOSED',
            status: 'executed',
            meta: { meetingType, suggestedTimes },
          },
        });
      } catch (err: unknown) {
        void this.opsAlert?.alertOnCriticalError(err, 'UnifiedAgentActionsSalesService.create');
        const errMsg =
          err instanceof Error ? err.message : typeof err === 'string' ? err : 'unknown';
        if (!isTestEnv) {
          const code = (err as { code?: string } | null)?.code;
          if (code === 'P2003') {
            this.logger.debug(`Skipping meeting event log due to FK (contactId=${contactId})`);
          } else {
            this.logger.warn(`Failed to log meeting event: ${errMsg}`);
          }
        }
      }
      // messageLimit: enforced via PlanLimitsService.trackMessageSend
      await this.messaging.actionSendMessage(workspaceId, phone, { message }, context);
      return { success: true, meetingType, suggestedTimes, messageSent: true };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        error,
        'UnifiedAgentActionsSalesService.actionSendMessage',
      );
      const msg =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown';
      this.logger.error(`Erro ao agendar reunião: ${msg}`);
      return { success: false, error: msg };
    }
  }

  async actionAntiChurn(
    workspaceId: string,
    contactId: string,
    phone: string,
    args: ToolArgs,
    context?: UnknownRecord,
  ) {
    try {
      const isTestEnv = !!process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test';
      const strategy = args?.strategy || 'discount';
      const offer = args?.offer || '';
      const message = antiChurnMessage(strategy, offer || '');
      if (!message) {
        return { success: false, error: 'No strategy message found' };
      }
      try {
        await this.prisma.autopilotEvent.create({
          data: {
            workspaceId,
            contactId,
            intent: 'RETENTION',
            action: 'ANTI_CHURN_TRIGGERED',
            status: 'executed',
            meta: { strategy, offer },
          },
        });
      } catch (err: unknown) {
        void this.opsAlert?.alertOnCriticalError(err, 'UnifiedAgentActionsSalesService.create');
        const errMsg =
          err instanceof Error ? err.message : typeof err === 'string' ? err : 'unknown';
        if (!isTestEnv) {
          const code = (err as { code?: string } | null)?.code;
          if (code === 'P2003') {
            this.logger.debug(`Skipping retention event log due to FK (contactId=${contactId})`);
          } else {
            this.logger.warn(`Failed to log retention event: ${errMsg}`);
          }
        }
      }
      // messageLimit: enforced via PlanLimitsService.trackMessageSend
      await this.messaging.actionSendMessage(workspaceId, phone, { message }, context);
      return { success: true, strategy, messageSent: true };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        error,
        'UnifiedAgentActionsSalesService.actionSendMessage',
      );
      const msg =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown';
      this.logger.error(`Erro em anti-churn: ${msg}`);
      return { success: false, error: msg };
    }
  }

  async actionReactivateGhost(
    workspaceId: string,
    contactId: string,
    phone: string,
    args: ToolArgs,
    context?: UnknownRecord,
  ) {
    try {
      const strategy = args?.strategy || 'curiosity';
      const daysSilent = args?.daysSilent || 7;
      const message = REACTIVATION_MESSAGES[strategy] || REACTIVATION_MESSAGES.curiosity;
      if (!message) {
        return { success: false, error: 'No reactivation message found' };
      }
      await this.prisma.autopilotEvent.create({
        data: {
          workspaceId,
          contactId,
          intent: 'REACTIVATION',
          action: 'GHOST_CONTACTED',
          status: 'executed',
          meta: { strategy, daysSilent },
        },
      });
      await this.prisma.contact
        .update({ where: { id: contactId }, data: { updatedAt: new Date() } })
        .catch((err: unknown) => {
          const errStr = describeUnknownError(err);
          this.logger.warn(`Failed to update contact updatedAt: ${errStr}`);
        });
      // messageLimit: enforced via PlanLimitsService.trackMessageSend
      await this.messaging.actionSendMessage(workspaceId, phone, { message }, context);
      return { success: true, strategy, daysSilent, messageSent: true };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        error,
        'UnifiedAgentActionsSalesService.actionSendMessage',
      );
      const msg =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown';
      this.logger.error(`Erro ao reativar ghost: ${msg}`);
      return { success: false, error: msg };
    }
  }
}
