import type { Prisma, PrismaClient } from '@prisma/client';

import type { UnknownRecord } from '../common/types';

// ── Pure helpers ────────────────────────────────────────────────────────────

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

/** Clamp a raw discount-percent input into the [1, 30] range, defaulting to 10. */
export function clampDiscountPercent(raw: unknown): number {
  return Math.min(Math.max(Number(raw) || 10, 1), 30);
}

/** Map a lead-qualification stage label to a purchase-probability bucket. */
export function getStagePurchaseProbabilityBucket(stage: string): string {
  const buckets: Record<string, string> = {
    awareness: 'LOW',
    interest: 'MEDIUM',
    decision: 'HIGH',
    action: 'VERY_HIGH',
  };
  return buckets[stage] || 'LOW';
}

// ── Message lookup maps ────────────────────────────────────────────────────

/** Human-readable labels for each meeting type. */
export const MEETING_TYPE_LABELS: Record<string, string> = {
  demo: 'Demonstracao do Produto',
  consultation: 'Consultoria',
  followup: 'Conversa de Acompanhamento',
  support: 'Suporte Tecnico',
};

/** Resolve an anti-churn strategy label into its outbound message. */
export function antiChurnMessage(strategy: string, offer: string): string {
  const messages: Record<string, string> = {
    discount: `Antes de concluir seu cancelamento, tenho uma condição comercial para você.\n\nQue tal um desconto exclusivo de 30% para continuar conosco? ${offer || 'Você é um cliente valioso e queremos mantê-lo!'}`,
    upgrade:
      'Que tal um upgrade gratuito?\n\nPosso liberar recursos premium para você experimentar por 30 dias, sem custo adicional!',
    downgrade:
      'Entendo que às vezes precisamos ajustar.\n\nTemos um plano mais acessível que pode atender suas necessidades. Quer conhecer?',
    pause:
      'Sem problemas. Que tal pausar sua assinatura por um mês?\n\nAssim você pode voltar quando for mais conveniente, sem perder nada.',
    feedback:
      'Sua opinião é muito importante para nós.\n\nO que podemos melhorar? Estou aqui para ouvir e resolver qualquer problema.',
    vip_support:
      'Você está em atendimento prioritário.\n\nVou te conectar com nosso time de suporte prioritário para resolver qualquer questão.',
  };
  return messages[strategy] || messages.feedback;
}

/** Reactivation messages keyed by strategy label. */
export const REACTIVATION_MESSAGES: Record<string, string> = {
  curiosity:
    'Oi! Percebi que você se afastou da conversa.\n\nAconteceu algo? Tenho novidades que podem te interessar.',
  urgency:
    'Última chance.\n\nAquela oferta que conversamos está acabando. Não quero que você perca essa oportunidade!',
  value:
    'Lembrei de você hoje.\n\nVi um caso de sucesso de um cliente parecido com você e pensei: isso pode te ajudar muito!',
  question:
    'Posso te fazer uma pergunta rápida?\n\nO que te fez não seguir em frente naquele momento? Sua opinião me ajuda a melhorar!',
  social_proof:
    'Mais de 500 pessoas já estão usando.\n\nOs resultados têm sido incríveis. Dá uma olhada no que estão falando!',
};

// ── actionHandleObjection (complex helper with deps) ────────────────────────

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
