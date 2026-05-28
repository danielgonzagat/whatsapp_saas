import { StructuredLogger } from '../logging/structured-logger';
import { appendToolResultProof, formatToolResult } from './guest-chat.action-intent.helpers';
import {
  GuestConversation,
  PendingOperationalAction,
  getOrCreateConversation,
  persistConversation,
} from './guest-chat.conversation.helpers';

/**
 * Pure operational helpers extracted from guest-chat.chat.helpers.ts (WAVE 77)
 * to keep the main chat dispatcher focused on orchestration. These helpers are
 * deterministic, side-effect-free where possible, and unit-testable in
 * isolation. The only I/O performed here is conversation persistence inside
 * `persistPendingAction`, which is intentionally kept alongside the pending
 * action lifecycle predicates to avoid splitting tightly-coupled state.
 */

export function readMissingInputs(result: unknown): string[] {
  const record = (result as Record<string, unknown> | undefined) ?? {};
  return Array.isArray(record.missingInputs)
    ? record.missingInputs.filter(
        (input): input is string => typeof input === 'string' && input.trim().length > 0,
      )
    : [];
}

export function formatOperationalToolReply(tool: string, result: unknown): string {
  const record = (result as Record<string, unknown> | undefined) ?? {};
  const missingInputs = readMissingInputs(result);

  if (record.success === false && missingInputs.length > 0) {
    const message =
      typeof record.message === 'string' && record.message.trim()
        ? record.message.trim()
        : `Dados faltantes para executar ${tool}: ${missingInputs.join(', ')}`;
    return `${message}. Nenhuma ação real foi executada ainda.`;
  }

  return appendToolResultProof(formatToolResult(tool, result), result);
}

const OPERATIONAL_INPUT_LABELS: Record<string, readonly string[]> = {
  productId: ['productId', 'produtoId'],
  planId: ['planId', 'planoId'],
  customerName: ['customerName', 'nomeCliente', 'nome'],
  customerEmail: ['customerEmail', 'email', 'e-mail'],
  customerCpf: ['customerCpf', 'cpf'],
  customerPhone: ['customerPhone', 'telefone', 'celular'],
  customerZipCode: ['customerZipCode', 'cep'],
  customerStreet: ['customerStreet', 'rua'],
  customerNumber: ['customerNumber', 'numero', 'número'],
  customerNeighborhood: ['customerNeighborhood', 'bairro'],
  customerCity: ['customerCity', 'cidade'],
  customerState: ['customerState', 'uf', 'estado'],
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const OPERATIONAL_INPUT_LABEL_PATTERN = Object.values(OPERATIONAL_INPUT_LABELS)
  .flat()
  .sort((left, right) => right.length - left.length)
  .map(escapeRegex)
  .join('|');

function readOperationalInput(message: string, input: string): string | undefined {
  const labels = OPERATIONAL_INPUT_LABELS[input] ?? [input];
  const labelPattern = labels.map(escapeRegex).join('|');
  const matcher = new RegExp(
    `(?:^|\\s)(?:${labelPattern})\\s*[:=]?\\s*(.+?)(?=\\s+(?:${OPERATIONAL_INPUT_LABEL_PATTERN})\\s*[:=]?\\s*|$)`,
    'i',
  );
  const value = matcher.exec(message)?.[1]?.trim();
  if (!value) {
    return undefined;
  }
  return value.replace(/[,.]$/, '').trim();
}

export function extractOperationalInputs(
  message: string,
  inputs: readonly string[],
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const input of inputs) {
    const value = readOperationalInput(message, input);
    if (value) {
      values[input] = value;
    }
  }
  return values;
}

export function isMissingOperationalInput(args: Record<string, unknown>, input: string): boolean {
  const value = args[input];
  return value === undefined || value === null || (typeof value === 'string' && !value.trim());
}

export function buildMissingInputsReply(tool: string, missingInputs: readonly string[]): string {
  return `Dados faltantes para executar ${tool}: ${missingInputs.join(', ')}. Nenhuma ação real foi executada ainda.`;
}

export async function persistPendingAction(
  sessionId: string,
  prompt: string,
  action: { tool: string; args: Record<string, unknown> },
  redis: import('ioredis').default | undefined,
  conversations: Map<string, GuestConversation>,
  logger: StructuredLogger,
  missingInputs: readonly string[] = [],
): Promise<PendingOperationalAction> {
  const pendingConversation = await getOrCreateConversation(
    sessionId,
    redis,
    conversations,
    logger,
  );
  const pendingAction: PendingOperationalAction = {
    tool: action.tool,
    args: action.args,
    createdAt: new Date().toISOString(),
    prompt,
    ...(missingInputs.length > 0 ? { missingInputs: [...missingInputs] } : {}),
  };
  pendingConversation.pendingAction = pendingAction;
  await persistConversation(sessionId, pendingConversation, redis, conversations, logger);
  return pendingAction;
}

export function isConfirmingPendingAction(message: string): boolean {
  return /^(sim|s|confirmo|confirma|confirmado|ok|pode executar|executa|autorizo)\b/i.test(
    message.trim(),
  );
}

export function isCancellingPendingAction(message: string): boolean {
  return /^(n[aã]o|nao|cancel[ae]?|cancela|desiste|para|pare)\b/i.test(message.trim());
}

export function buildPendingActionConfirmation(action: PendingOperationalAction): string {
  const keys = Object.keys(action.args);
  const summary = keys.length > 0 ? ` com dados: ${keys.join(', ')}` : '';
  return `Vou executar a ação real ${action.tool}${summary}. Confirma?`;
}
