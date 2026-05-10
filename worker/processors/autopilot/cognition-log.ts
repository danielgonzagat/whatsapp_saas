import { createHash } from 'node:crypto';
import { prisma } from '../../db';
import {
  WHITESPACE_RE,
  type UnknownRecord,
} from './shared';
import { type CustomerCognitiveState, type CognitiveActionType } from '../cia/cognitive-state';

export function buildCognitiveMessage(params: {
  action: CognitiveActionType;
  state?: CustomerCognitiveState | null;
  contactName?: string;
  matchedProducts?: string[];
  tactic?: string | null;
}) {
  const leadFirstName = String(params.contactName || '').trim().split(WHITESPACE_RE).filter(Boolean)[0];
  const productText = params.matchedProducts?.length ? ` sobre ${params.matchedProducts.join(', ')}` : '';
  const tactic = String(params.tactic || '');
  const prefix =
    leadFirstName && (tactic === 'EMPATHETIC_ECHO' || tactic === 'STORYTELLING_HOOK') ? `${leadFirstName}, ` : '';

  switch (params.action) {
    case 'ASK_CLARIFYING':
      if (tactic === 'EMPATHETIC_ECHO') return `${prefix}faz sentido querer entender isso melhor${productText}. O que pesa mais pra você agora?`;
      if (tactic === 'PAIN_PROBING') return `${prefix}pra eu te orientar certo${productText}, o que mais te trava hoje?`;
      if (tactic === 'QUALIFY_NEED') return `Pra eu te orientar certo${productText}, qual necessidade você quer resolver primeiro?`;
      return `Pra eu te ajudar melhor${productText}, sua prioridade é valor, resultado ou próximo passo?`;
    case 'SOCIAL_PROOF':
      if (tactic === 'TRUST_REASSURANCE') return `Faz sentido ter essa dúvida${productText}. Se quiser, eu te explico o ponto principal de forma direta.`;
      return `Faz sentido ter essa dúvida${productText}. Se quiser, eu te mostro o que costuma destravar essa decisão.`;
    case 'OFFER':
      if (tactic === 'EMPATHETIC_ECHO') return `${prefix}pelo que você trouxe${productText}, faz sentido buscar um caminho simples e seguro. Se quiser, eu te mostro a melhor opção agora.`;
      if (tactic === 'EPIPHANY_DROP') return `${prefix}tem um detalhe${productText} que costuma mudar a decisão: a melhor opção nem sempre é a mais barata, e sim a que resolve com menos atrito. Se quiser, eu te mostro qual faz mais sentido aqui.`;
      if (tactic === 'STORYTELLING_HOOK') return `${prefix}isso me lembra gente que quase travou nessa etapa${productText} e destravou quando viu o caminho mais simples. Se quiser, eu te mostro direto.`;
      if (tactic === 'CHECKOUT_SIMPLIFICATION') return `Pelo que você me disse${productText}, eu posso te mostrar a opção mais simples pra avançar agora.`;
      if (tactic === 'PRICE_VALUE_REFRAME') return `Aqui${productText}, o ponto não é só preço. Se fizer sentido, eu te mostro a opção com melhor custo-benefício.`;
      return `Pelo que você me disse${productText}, eu já posso te mostrar a melhor opção pra seguir.`;
    case 'FOLLOWUP_URGENT':
      if (tactic === 'SAFE_URGENCY') return `Ainda dá pra priorizar isso hoje${productText}. Se fizer sentido, eu já te passo o próximo passo.`;
      return `Sua conversa está perto de avançar${productText}. Se ainda fizer sentido, eu sigo com você agora.`;
    case 'FOLLOWUP_SOFT':
      if (tactic === 'EMPATHETIC_ECHO') return `${prefix}sua conversa ficou em aberto${productText}, e tudo bem. Se ainda fizer sentido, eu continuo daqui sem te fazer repetir nada.`;
      if (tactic === 'CHECKOUT_SIMPLIFICATION') return `Sua conversa ficou em aberto${productText}. Se ainda fizer sentido, eu te resumo o caminho mais simples.`;
      return `Sua conversa ficou em aberto${productText}. Se quiser, eu continuo daqui.`;
    case 'PAYMENT_RECOVERY':
      if (tactic === 'CHECKOUT_SIMPLIFICATION') return `Seu pagamento ficou pendente${productText}. Se quiser, eu te passo o próximo passo agora.`;
      return `Seu pagamento ficou pendente${productText}. Se quiser, eu reativo isso agora.`;
    default:
      if (tactic === 'TRUST_REASSURANCE') return `Estou acompanhando sua conversa${productText}. Se quiser, eu te digo o melhor próximo passo.`;
      if (tactic === 'EMPATHETIC_ECHO') return `${prefix}eu acompanhei o que você trouxe${productText}. Se fizer sentido, eu te digo o próximo passo mais leve daqui.`;
      return `Estou acompanhando sua conversa${productText}. Posso seguir com você por aqui.`;
  }
}

export function normalizeAutonomyLedgerValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => normalizeAutonomyLedgerValue(item));
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.keys(record).sort().reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = normalizeAutonomyLedgerValue(record[key]);
      return acc;
    }, {});
  }
  return value ?? null;
}

export function buildAutonomyExecutionKey(input: {
  workspaceId: string;
  actionType: string;
  contactId?: string | undefined;
  conversationId?: string | undefined;
  phone?: string | undefined;
  payload: Record<string, unknown>;
}) {
  const hash = createHash('sha256');
  hash.update(JSON.stringify(normalizeAutonomyLedgerValue({
    workspaceId: input.workspaceId, actionType: input.actionType,
    contactId: input.contactId || null, conversationId: input.conversationId || null,
    phone: input.phone || null, payload: input.payload,
  })));
  return hash.digest('hex');
}

export function isAutonomyExecutionDuplicate(err: unknown) {
  const e = err as UnknownRecord | undefined;
  return e?.code === 'P2002' || String(e?.message || '').toLowerCase().includes('unique constraint');
}

export async function beginAutonomyExecution(input: {
  workspaceId: string;
  actionType: string;
  contactId?: string | undefined;
  conversationId?: string | undefined;
  workItemId?: string | null;
  proofId?: string | null;
  capabilityCode?: string | null;
  tacticCode?: string | null;
  idempotencyKey: string;
  request: Record<string, unknown>;
}) {
  const client = prisma as never as UnknownRecord;
  if (!client.autonomyExecution) return { allowed: true as const, record: null };

  try {
    const record = await client.autonomyExecution.create({
      data: {
        workspaceId: input.workspaceId, contactId: input.contactId,
        conversationId: input.conversationId, workItemId: input.workItemId || null,
        proofId: input.proofId || null,
        capabilityCode: input.capabilityCode || input.actionType,
        tacticCode: input.tacticCode || null,
        idempotencyKey: input.idempotencyKey, actionType: input.actionType,
        request: input.request, status: 'PENDING',
      },
    });
    return { allowed: true as const, record };
  } catch (err: unknown) {
    if (!isAutonomyExecutionDuplicate(err)) throw err;

    const existing = await client.autonomyExecution.findFirst({
      where: { workspaceId: input.workspaceId, idempotencyKey: input.idempotencyKey },
    });

    if (existing?.status === 'FAILED') {
      const record = await client.autonomyExecution.update({
        where: { id: existing.id },
        data: {
          request: input.request, workItemId: input.workItemId || null,
          proofId: input.proofId || null,
          capabilityCode: input.capabilityCode || input.actionType,
          tacticCode: input.tacticCode || null,
          response: null, error: null, status: 'PENDING',
        },
      });
      return { allowed: true as const, record, replay: true as const };
    }

    return {
      allowed: false as const, record: existing || null,
      reason: existing?.status === 'SUCCESS' ? 'duplicate_execution_success' : 'duplicate_execution_pending',
    };
  }
}

export async function finishAutonomyExecution(
  recordId: string | undefined,
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED',
  payload?: { response?: Record<string, unknown> | null; error?: string | null },
) {
  if (!recordId) return;
  const client = prisma as never as UnknownRecord;
  if (!client.autonomyExecution) return;

  await client.autonomyExecution.update({
    where: { id: recordId },
    data: { status, response: payload?.response ?? undefined, error: payload?.error ?? undefined },
  });
}
