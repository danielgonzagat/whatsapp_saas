import { createHash } from 'node:crypto';
import { prisma } from '../../db';
import {
  WHITESPACE_RE,
  type UnknownRecord,
} from './shared';
import { type CustomerCognitiveState, type CognitiveActionType } from '../cia/cognitive-state';

type CognitiveMessageResolver = (ctx: { prefix: string; productText: string }) => string;

interface TacticTemplate {
  tactic: string;
  resolve: CognitiveMessageResolver;
}

const ACTION_TACTIC_MAP: Record<string, { default: CognitiveMessageResolver; tactics: TacticTemplate[] }> = {
  ASK_CLARIFYING: {
    default: ({ productText }) =>
      `Pra eu te ajudar melhor${productText}, sua prioridade e valor, resultado ou proximo passo?`,
    tactics: [
      { tactic: 'EMPATHETIC_ECHO', resolve: ({ prefix, productText }) => `${prefix}faz sentido querer entender isso melhor${productText}. O que pesa mais pra voce agora?` },
      { tactic: 'PAIN_PROBING', resolve: ({ prefix, productText }) => `${prefix}pra eu te orientar certo${productText}, o que mais te trava hoje?` },
      { tactic: 'QUALIFY_NEED', resolve: ({ productText }) => `Pra eu te orientar certo${productText}, qual necessidade voce quer resolver primeiro?` },
    ],
  },
  SOCIAL_PROOF: {
    default: ({ productText }) =>
      `Faz sentido ter essa duvida${productText}. Se quiser, eu te mostro o que costuma destravar essa decisao.`,
    tactics: [
      { tactic: 'TRUST_REASSURANCE', resolve: ({ productText }) => `Faz sentido ter essa duvida${productText}. Se quiser, eu te explico o ponto principal de forma direta.` },
    ],
  },
  OFFER: {
    default: ({ productText }) =>
      `Pelo que voce me disse${productText}, eu ja posso te mostrar a melhor opcao pra seguir.`,
    tactics: [
      { tactic: 'EMPATHETIC_ECHO', resolve: ({ prefix, productText }) => `${prefix}pelo que voce trouxe${productText}, faz sentido buscar um caminho simples e seguro. Se quiser, eu te mostro a melhor opcao agora.` },
      { tactic: 'EPIPHANY_DROP', resolve: ({ prefix, productText }) => `${prefix}tem um detalhe${productText} que costuma mudar a decisao: a melhor opcao nem sempre e a mais barata, e sim a que resolve com menos atrito. Se quiser, eu te mostro qual faz mais sentido aqui.` },
      { tactic: 'STORYTELLING_HOOK', resolve: ({ prefix, productText }) => `${prefix}isso me lembra gente que quase travou nessa etapa${productText} e destravou quando viu o caminho mais simples. Se quiser, eu te mostro direto.` },
      { tactic: 'CHECKOUT_SIMPLIFICATION', resolve: ({ productText }) => `Pelo que voce me disse${productText}, eu posso te mostrar a opcao mais simples pra avancar agora.` },
      { tactic: 'PRICE_VALUE_REFRAME', resolve: ({ productText }) => `Aqui${productText}, o ponto nao e so preco. Se fizer sentido, eu te mostro a opcao com melhor custo-beneficio.` },
    ],
  },
  FOLLOWUP_URGENT: {
    default: ({ productText }) =>
      `Sua conversa esta perto de avancar${productText}. Se ainda fizer sentido, eu sigo com voce agora.`,
    tactics: [
      { tactic: 'SAFE_URGENCY', resolve: ({ productText }) => `Ainda da pra priorizar isso hoje${productText}. Se fizer sentido, eu ja te passo o proximo passo.` },
    ],
  },
  FOLLOWUP_SOFT: {
    default: ({ productText }) =>
      `Sua conversa ficou em aberto${productText}. Se quiser, eu continuo daqui.`,
    tactics: [
      { tactic: 'EMPATHETIC_ECHO', resolve: ({ prefix, productText }) => `${prefix}sua conversa ficou em aberto${productText}, e tudo bem. Se ainda fizer sentido, eu continuo daqui sem te fazer repetir nada.` },
      { tactic: 'CHECKOUT_SIMPLIFICATION', resolve: ({ productText }) => `Sua conversa ficou em aberto${productText}. Se ainda fizer sentido, eu te resumo o caminho mais simples.` },
    ],
  },
  PAYMENT_RECOVERY: {
    default: ({ productText }) =>
      `Seu pagamento ficou pendente${productText}. Se quiser, eu reativo isso agora.`,
    tactics: [
      { tactic: 'CHECKOUT_SIMPLIFICATION', resolve: ({ productText }) => `Seu pagamento ficou pendente${productText}. Se quiser, eu te passo o proximo passo agora.` },
    ],
  },
  _DEFAULT: {
    default: ({ productText }) =>
      `Estou acompanhando sua conversa${productText}. Posso seguir com voce por aqui.`,
    tactics: [
      { tactic: 'TRUST_REASSURANCE', resolve: ({ productText }) => `Estou acompanhando sua conversa${productText}. Se quiser, eu te digo o melhor proximo passo.` },
      { tactic: 'EMPATHETIC_ECHO', resolve: ({ prefix, productText }) => `${prefix}eu acompanhei o que voce trouxe${productText}. Se fizer sentido, eu te digo o proximo passo mais leve daqui.` },
    ],
  },
};

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
  const ctx = { prefix, productText };

  const mapping = ACTION_TACTIC_MAP[params.action] || ACTION_TACTIC_MAP._DEFAULT;
  const matched = mapping.tactics.find((t) => t.tactic === tactic);
  return matched ? matched.resolve(ctx) : mapping.default(ctx);
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
