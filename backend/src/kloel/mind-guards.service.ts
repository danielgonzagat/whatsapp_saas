import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { KloelRuleEngineService } from './rules/kloel-rule-engine.service';
import type { RuleContext } from './rules/kloel-rules.types';
import {
  MIND_GUARD_REASON_TAGS,
  type GuardReasonTag,
  type MindActionContext,
  type MindGuardResult,
} from './mind-code-native.types';

const GUARD_REASON_TAGS = new Set<string>(MIND_GUARD_REASON_TAGS);

function jsonContext(context: MindActionContext): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(context)) as Prisma.InputJsonObject;
}

function toGuardReasonTag(ruleId: string | null): GuardReasonTag {
  return GUARD_REASON_TAGS.has(ruleId ?? '') ? (ruleId as GuardReasonTag) : 'all_guards_passed';
}

@Injectable()
export class MindGuardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: KloelRuleEngineService,
  ) {}

  async evaluate(input: {
    action: string;
    context: MindActionContext;
    decisionType: string;
    workspaceId: string;
  }): Promise<MindGuardResult> {
    const ruleCtx: RuleContext = {
      action: input.action,
      ...(input.context.channel !== undefined ? { channel: input.context.channel } : {}),
      ...(input.context.contactOptOut !== undefined ? { contactOptOut: input.context.contactOptOut } : {}),
      ...(input.context.withinComplianceWindow !== undefined ? { withinComplianceWindow: input.context.withinComplianceWindow } : {}),
      ...(input.context.templateApproved !== undefined ? { templateApproved: input.context.templateApproved } : {}),
      ...(input.context.contactMessagesToday !== undefined ? { contactMessagesToday: input.context.contactMessagesToday } : {}),
      ...(input.context.campaignBudgetExhausted !== undefined ? { campaignBudgetExhausted: input.context.campaignBudgetExhausted } : {}),
      ...(input.context.campaignActive !== undefined ? { campaignActive: input.context.campaignActive } : {}),
      ...(input.context.paymentProcessed !== undefined ? { paymentProcessed: input.context.paymentProcessed } : {}),
      ...(input.context.paymentAmount !== undefined ? { paymentAmount: input.context.paymentAmount } : {}),
      ...(input.context.maxPaymentAmount !== undefined ? { maxPaymentAmount: input.context.maxPaymentAmount } : {}),
      ...(input.context.discountPercent !== undefined ? { discountPercent: input.context.discountPercent } : {}),
      ...(input.context.maxDiscountPercent !== undefined ? { maxDiscountPercent: input.context.maxDiscountPercent } : {}),
      ...(input.context.minMarginPercent !== undefined ? { minMarginPercent: input.context.minMarginPercent } : {}),
      ...(input.context.escalationInProgress !== undefined ? { escalationInProgress: input.context.escalationInProgress } : {}),
      ...(input.context.humanAvailable !== undefined ? { humanAvailable: input.context.humanAvailable } : {}),
      ...(input.context.productId !== undefined ? { productId: input.context.productId } : {}),
      ...(input.context.supportsAudio !== undefined ? { supportsAudio: input.context.supportsAudio } : {}),
      ...(input.context.supportsDocument !== undefined ? { supportsDocument: input.context.supportsDocument } : {}),
      ...(input.context.supportsNativeAudio !== undefined ? { supportsNativeAudio: input.context.supportsNativeAudio } : {}),
    };

    const trace = this.engine.evaluate(ruleCtx);
    const blockedBy = trace.blockedBy ?? 'rule_engine';
    const blockedReason = trace.blockedReason ?? 'Ação vetada pelo motor de regras determinístico.';

    const finalResult: MindGuardResult = trace.blocked
      ? {
          allowed: false,
          decision: 'block',
          guardName: blockedBy,
          action: input.action,
          reason: blockedReason,
          reasonTag: toGuardReasonTag(trace.blockedBy),
          context: jsonContext(input.context),
        }
      : {
          allowed: true,
          action: input.action,
          decision: 'allow',
          guardName: 'all_guards',
          reason: 'Ação aprovada pelas guardas determinísticas.',
          reasonTag: 'all_guards_passed',
          context: jsonContext(input.context),
        };

    await this.prisma.mindGuardAudit.create({
      data: {
        id: randomUUID(),
        workspaceId: input.workspaceId,
        guardName: finalResult.guardName,
        action: input.action,
        decision: finalResult.decision,
        allowed: finalResult.allowed,
        reason: finalResult.reason,
        context: finalResult.context,
      },
    });

    return finalResult;
  }
}
