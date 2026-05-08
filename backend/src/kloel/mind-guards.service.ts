import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { GuardReasonTag, MindActionContext, MindGuardResult } from './mind-code-native.types';

type GuardFn = (action: string, context: MindActionContext) => MindGuardResult | null;

function jsonContext(context: MindActionContext): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(context)) as Prisma.InputJsonObject;
}

function result(
  guardName: string,
  action: string,
  context: MindActionContext,
  reason: string,
  reasonTag: GuardReasonTag,
): MindGuardResult {
  return {
    allowed: false,
    decision: 'block',
    guardName,
    action,
    reason,
    reasonTag,
    context: jsonContext(context),
  };
}

@Injectable()
export class MindGuardsService {
  private readonly guards: GuardFn[] = [
    (action, context) =>
      context.contactOptOut
        ? result('opt_out', action, context, 'Contato possui opt-out registrado.', 'opt_out')
        : null,
    (action, context) =>
      context.withinComplianceWindow === false && !context.templateApproved
        ? result(
            'compliance_window',
            action,
            context,
            'Mensagem fora da janela do canal exige template aprovado.',
            'compliance_window',
          )
        : null,
    (action, context) =>
      typeof context.contactMessagesToday === 'number' && context.contactMessagesToday >= 20
        ? result(
            'daily_contact_limit',
            action,
            context,
            'Limite diário de mensagens atingido.',
            'daily_contact_limit',
          )
        : null,
    (action, context) =>
      action.includes('audio') && context.supportsAudio === false
        ? result(
            'unsupported_audio',
            action,
            context,
            'Canal não suporta áudio nativo.',
            'unsupported_audio',
          )
        : null,
    (action, context) =>
      action.includes('document') && context.supportsDocument === false
        ? result(
            'unsupported_document',
            action,
            context,
            'Canal não suporta documento.',
            'unsupported_document',
          )
        : null,
    (action, context) =>
      action.includes('checkout') && !context.productId
        ? result(
            'checkout_product_required',
            action,
            context,
            'Link de checkout exige produto.',
            'checkout_product_required',
          )
        : null,
    (action, context) =>
      action.includes('payment') && context.paymentProcessed
        ? result(
            'duplicate_payment',
            action,
            context,
            'Pagamento já processado anteriormente.',
            'duplicate_payment',
          )
        : null,
    (action, context) =>
      action.includes('payment') &&
      typeof context.paymentAmount === 'number' &&
      typeof context.maxPaymentAmount === 'number' &&
      context.paymentAmount > context.maxPaymentAmount
        ? result(
            'payment_amount_exceeded',
            action,
            context,
            `Valor do pagamento (${context.paymentAmount}) excede o máximo permitido (${context.maxPaymentAmount}).`,
            'payment_amount_exceeded',
          )
        : null,
    (action, context) =>
      typeof context.discountPercent === 'number' &&
      typeof context.maxDiscountPercent === 'number' &&
      context.discountPercent > context.maxDiscountPercent
        ? result(
            'max_discount',
            action,
            context,
            'Desconto excede o teto permitido do produto.',
            'max_discount',
          )
        : null,
    (action, context) =>
      typeof context.minMarginPercent === 'number' && context.minMarginPercent < 0
        ? result(
            'minimum_margin',
            action,
            context,
            'Desconto reduziria a margem abaixo do mínimo.',
            'minimum_margin',
          )
        : null,
    (action, context) =>
      action.includes('campaign') && context.campaignBudgetExhausted
        ? result(
            'campaign_budget_exhausted',
            action,
            context,
            'Orçamento da campanha esgotado.',
            'campaign_budget_exhausted',
          )
        : null,
    (action, context) =>
      action.includes('campaign') && context.campaignActive === false
        ? result(
            'campaign_inactive',
            action,
            context,
            'Campanha não está ativa no momento.',
            'campaign_inactive',
          )
        : null,
    (action, context) =>
      action.includes('escalation') && context.escalationInProgress
        ? result(
            'escalation_in_progress',
            action,
            context,
            'Já existe uma escalação em andamento para este contato.',
            'escalation_in_progress',
          )
        : null,
    (action, context) =>
      action.includes('escalation') && context.humanAvailable === false
        ? result(
            'no_human_available',
            action,
            context,
            'Nenhum operador humano disponível para escalação no momento.',
            'no_human_available',
          )
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
        reasonTag: 'all_guards_passed' satisfies GuardReasonTag,
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
