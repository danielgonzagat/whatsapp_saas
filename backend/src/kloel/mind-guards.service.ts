import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { MindActionContext, MindGuardResult } from './mind-code-native.types';

type GuardFn = (action: string, context: MindActionContext) => MindGuardResult | null;

function jsonContext(context: MindActionContext): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(context)) as Prisma.InputJsonObject;
}

function result(
  guardName: string,
  action: string,
  context: MindActionContext,
  reason: string,
): MindGuardResult {
  return {
    allowed: false,
    decision: 'block',
    guardName,
    action,
    reason,
    context: jsonContext(context),
  };
}

@Injectable()
export class MindGuardsService {
  private readonly guards: GuardFn[] = [
    (action, context) =>
      context.contactOptOut
        ? result('opt_out', action, context, 'Contato possui opt-out registrado.')
        : null,
    (action, context) =>
      context.withinComplianceWindow === false && !context.templateApproved
        ? result(
            'compliance_window',
            action,
            context,
            'Mensagem fora da janela do canal exige template aprovado.',
          )
        : null,
    (action, context) =>
      typeof context.contactMessagesToday === 'number' && context.contactMessagesToday >= 20
        ? result('daily_contact_limit', action, context, 'Limite diário de mensagens atingido.')
        : null,
    (action, context) =>
      action.includes('audio') && context.supportsAudio === false
        ? result('unsupported_audio', action, context, 'Canal não suporta áudio nativo.')
        : null,
    (action, context) =>
      action.includes('document') && context.supportsDocument === false
        ? result('unsupported_document', action, context, 'Canal não suporta documento.')
        : null,
    (action, context) =>
      action.includes('checkout') && !context.productId
        ? result('checkout_product_required', action, context, 'Link de checkout exige produto.')
        : null,
    (action, context) =>
      typeof context.discountPercent === 'number' &&
      typeof context.maxDiscountPercent === 'number' &&
      context.discountPercent > context.maxDiscountPercent
        ? result('max_discount', action, context, 'Desconto excede o teto permitido do produto.')
        : null,
    (action, context) =>
      typeof context.minMarginPercent === 'number' && context.minMarginPercent < 0
        ? result('minimum_margin', action, context, 'Desconto reduziria a margem abaixo do mínimo.')
        : null,
  ];

  constructor(private readonly prisma: PrismaService) {}

  async evaluate(input: {
    action: string;
    context: MindActionContext;
    decisionType: string;
    workspaceId: string;
  }): Promise<MindGuardResult> {
    const blocked = this.guards.map((guard) => guard(input.action, input.context)).find(Boolean);
    const finalResult =
      blocked ??
      ({
        allowed: true,
        action: input.action,
        decision: 'allow',
        guardName: 'all_guards',
        reason: 'Ação aprovada pelas guardas determinísticas.',
        context: jsonContext(input.context),
      } satisfies MindGuardResult);

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
