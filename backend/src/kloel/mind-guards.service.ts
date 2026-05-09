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
      channel: input.context.channel,
      contactOptOut: input.context.contactOptOut,
      withinComplianceWindow: input.context.withinComplianceWindow,
      templateApproved: input.context.templateApproved,
      contactMessagesToday: input.context.contactMessagesToday,
      campaignBudgetExhausted: input.context.campaignBudgetExhausted,
      campaignActive: input.context.campaignActive,
      paymentProcessed: input.context.paymentProcessed,
      paymentAmount: input.context.paymentAmount,
      maxPaymentAmount: input.context.maxPaymentAmount,
      discountPercent: input.context.discountPercent,
      maxDiscountPercent: input.context.maxDiscountPercent,
      minMarginPercent: input.context.minMarginPercent,
      escalationInProgress: input.context.escalationInProgress,
      humanAvailable: input.context.humanAvailable,
      productId: input.context.productId,
      supportsAudio: input.context.supportsAudio,
      supportsDocument: input.context.supportsDocument,
      supportsNativeAudio: input.context.supportsNativeAudio,
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
