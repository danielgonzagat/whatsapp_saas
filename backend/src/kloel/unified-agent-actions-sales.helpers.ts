import type { Prisma, PrismaClient } from '@prisma/client';

import type { UnknownRecord } from '../common/types';

/**
 * Describe an unknown thrown value as a human-readable string.
 * Pure helper safe to call from any context.
 */
export function describeUnknownError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  return 'Unknown error';
}

/** Type guard for plain object records. */
export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

/** True when the surrounding pipeline context is deterministic (skip Mind). */
export function isDeterministicPipeline(context?: UnknownRecord): boolean {
  return context?.deterministicPipeline === true;
}

/** Convert an unknown value into a Prisma-compatible JSON value tree. */
export function toJsonValue(value: unknown): Prisma.InputJsonValue | null {
  if (value === null) {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    const output: Array<Prisma.InputJsonValue | null> = [];
    for (const item of value) {
      output.push(toJsonValue(item));
    }
    return output;
  }
  if (isRecord(value)) {
    const output: { [key: string]: Prisma.InputJsonValue | null } = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = toJsonValue(item);
    }
    return output;
  }
  return null;
}

/** Bucket a numeric price into a labelled band for analytics/policy. */
export function priceBandFor(price: number): string {
  if (price >= 1000) {
    return 'over_1000';
  }
  if (price >= 500) {
    return 'over_500';
  }
  if (price >= 300) {
    return 'over_300';
  }
  if (price >= 100) {
    return 'over_100';
  }
  return 'under_100';
}

/** Map a Mind coupon action label to a numeric discount percent. */
export function discountPercentFromMind(
  action: string | undefined,
  requestedPercent: number,
): number {
  if (action === 'coupon_5') {
    return 5;
  }
  if (action === 'coupon_10') {
    return 10;
  }
  if (action === 'coupon_15') {
    return 15;
  }
  if (action === 'coupon_20') {
    return 20;
  }
  return requestedPercent;
}

interface SalesActionArgs {
  objectionType?: string;
  technique?: string;
}

interface SalesMessagingService {
  actionSendMessage(
    workspaceId: string,
    phone: string,
    args: { message: string },
    context?: UnknownRecord,
  ): unknown;
}

interface SalesPrismaDelegate {
  kloelMemory: PrismaClient['kloelMemory'];
  autopilotEvent: PrismaClient['autopilotEvent'];
}

interface SalesOpsAlert {
  alertOnCriticalError(error: unknown, context: string): Promise<void>;
}

interface KloelMemoryRow {
  id: string;
  key: string;
  value: unknown;
}

function readObjectionMemoryValue(value: unknown): UnknownRecord | null {
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return typeof parsed === 'object' && parsed !== null ? (parsed as UnknownRecord) : null;
    } catch {
      return null;
    }
  }

  return typeof value === 'object' && value !== null ? (value as UnknownRecord) : null;
}

export async function actionHandleObjection(deps: {
  workspaceId: string;
  contactId: string;
  phone: string;
  args: SalesActionArgs;
  context: UnknownRecord | undefined;
  prisma: SalesPrismaDelegate;
  messaging: SalesMessagingService;
  logger: { error(msg: string): void };
  opsAlert?: SalesOpsAlert;
}) {
  const { workspaceId, contactId, phone, args, context } = deps;
  try {
    const objectionType = args.objectionType || 'other';
    const technique = args.technique || 'value_focus';
    const objections = await deps.prisma.kloelMemory.findMany({
      where: { workspaceId, category: 'objections' },
      select: { id: true, key: true, value: true },
      take: 50,
    });
    const objectionResponses: Record<string, string> = {
      price:
        'Entendo sua preocupação com o valor. Mas pense assim: quanto você perde por mês sem essa solução? \nO investimento se paga rapidamente quando você considera os resultados que vai alcançar.',
      time: 'Sei que seu tempo é precioso. Por isso desenvolvemos algo que economiza horas do seu dia. \nA implementação é rápida e você já começa a ver resultados na primeira semana.',
      trust:
        'É natural ter dúvidas sobre algo novo. Por isso oferecemos garantia total. \nSe não ficar satisfeito nos primeiros 7 dias, devolvemos 100% do seu dinheiro.',
      need: 'Entendo! Talvez você ainda não tenha percebido como isso pode transformar seu negócio. \nPosso mostrar casos de clientes do seu segmento que tiveram resultados incríveis?',
      competitor:
        'Ótimo que você está avaliando opções! Isso mostra que leva a sério a decisão. \nA diferença é que aqui você tem suporte personalizado e resultados comprovados.',
      other:
        'Compreendo totalmente sua posição. Cada cliente é único e merece atenção especial. \nO que posso fazer para ajudar você a tomar a melhor decisão?',
    };
    const customObjection = objections.find((o: KloelMemoryRow) => {
      const val = readObjectionMemoryValue(o.value);
      return val?.type === objectionType;
    });
    const objectionResponse = objectionResponses[objectionType] || objectionResponses.other;
    let response = objectionResponse;
    if (customObjection?.value) {
      const customData = readObjectionMemoryValue(customObjection.value);
      const customResponse = customData?.response;
      if (typeof customResponse === 'string' && customResponse.trim().length > 0) {
        response = customResponse;
      }
    }
    if (!response) {
      return { success: false, error: 'No objection response' };
    }
    await deps.prisma.autopilotEvent.create({
      data: {
        workspaceId,
        contactId,
        intent: 'OBJECTION',
        action: 'OBJECTION_HANDLED',
        status: 'executed',
        meta: { objectionType, technique, response: response.substring(0, 100) },
      },
    });
    await deps.messaging.actionSendMessage(workspaceId, phone, { message: response }, context);
    return { success: true, objectionType, technique, messageSent: true };
  } catch (error: unknown) {
    void deps.opsAlert?.alertOnCriticalError(
      error,
      'UnifiedAgentActionsSalesService.actionSendMessage',
    );
    const msg =
      error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown';
    deps.logger.error(`Erro ao tratar objeção: ${msg}`);
    return { success: false, error: msg };
  }
}
