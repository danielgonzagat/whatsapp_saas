// Pure helpers extracted from KloelDashboard.message.tsx to reduce
// cyclomatic complexity and enable unit testing. No React, no JSX, no
// styles — these are data-shape transforms only. Visual contract is
// preserved by the consumer component.

import { isRecord, type JsonRecord } from './KloelDashboard.helpers';

/**
 * Extracts the `brainIntent` string from a message metadata record.
 * Returns an empty string when the field is missing or not a string.
 */
export function getBrainIntent(metadata: JsonRecord): string {
  return typeof metadata.brainIntent === 'string' ? metadata.brainIntent : '';
}

/**
 * Extracts the `brainResult` record (a `{ data: ... }` envelope produced
 * by the brain operator) from message metadata. Returns null when the
 * field is absent or not an object.
 */
export function getBrainResult(metadata: JsonRecord): JsonRecord | null {
  return isRecord(metadata.brainResult) ? metadata.brainResult : null;
}

/**
 * Returns the raw `data` payload of the brain result, regardless of type
 * (the caller decides whether to treat it as an array, record, or null).
 */
export function getBrainResultData(metadata: JsonRecord): unknown {
  const result = getBrainResult(metadata);
  return result ? result.data : undefined;
}

/**
 * Coerces an unknown value into an array of records. Non-array inputs
 * become an empty array. Items are returned as-is — caller must treat
 * each entry as `Record<string, unknown>` and validate field shapes.
 */
export function toRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

/**
 * Returns true when the metadata payload contains a renderable
 * `brainOperator` flag (used to gate the result component).
 */
export function hasBrainOperator(metadata: JsonRecord): boolean {
  return Boolean(metadata.brainOperator);
}

/**
 * Returns true when the metadata payload contains a `brainFallback`
 * flag (used to render the "ainda nao consigo executar isso" hint).
 */
export function hasBrainFallback(metadata: JsonRecord): boolean {
  return Boolean(metadata.brainFallback);
}

export interface ProductRow {
  name: string;
  price: unknown;
  active: boolean;
}

/** Maps an unknown product entry into the row shape rendered in the UI. */
export function mapProductRow(entry: Record<string, unknown>): ProductRow {
  return {
    name: String(entry.name ?? '-'),
    price: entry.price,
    active: Boolean(entry.active),
  };
}

export interface ContactRow {
  name: string;
  phone: string;
  email: string;
  leadScore: string;
}

/** Maps an unknown contact entry into the row shape rendered in the UI. */
export function mapContactRow(entry: Record<string, unknown>): ContactRow {
  return {
    name: String(entry.name ?? '-'),
    phone: String(entry.phone ?? ''),
    email: entry.email ? String(entry.email) : '',
    leadScore: entry.leadScore ? String(entry.leadScore) : '',
  };
}

export interface ConversationRow {
  contact: unknown;
  preview: string;
  status: string;
  agentName: string;
}

/**
 * Maps an unknown conversation entry into the row shape rendered in
 * the UI. `contact` is left untyped so the consumer can run it through
 * `pickContactDisplayName` (which is not duplicated here).
 */
export function mapConversationRow(entry: Record<string, unknown>): ConversationRow {
  const agent = isRecord(entry.agent) ? entry.agent : null;
  return {
    contact: entry.contact,
    preview: String(entry.lastMessagePreview ?? '').slice(0, 80),
    status: String(entry.status ?? '-'),
    agentName: agent ? String(agent.name ?? '') : '',
  };
}

/**
 * Returns true when a conversation row should render its status chip
 * using the muted (closed) palette instead of the accent palette.
 */
export function isConversationStatusClosed(status: string): boolean {
  return status === 'closed';
}

export interface RevenueSummaryRow {
  label: string;
  value: string;
}

/**
 * Normalises an unknown revenue-summary payload into the labelled rows
 * rendered in the UI. The currency formatter is passed in so this
 * helper stays free of locale concerns.
 */
export function buildRevenueSummaryRows(
  summary: JsonRecord,
  formatCents: (value: unknown, fallback?: string) => string,
): RevenueSummaryRow[] {
  return [
    { label: 'Receita Total', value: formatCents(summary.totalRevenue, 'R$ 0.00') },
    { label: 'Ticket Medio', value: formatCents(summary.ticketMedio, 'R$ 0.00') },
    { label: 'Total de Pedidos', value: String(summary.totalCount ?? 0) },
    { label: 'Pedidos Pagos', value: String(summary.paidCount ?? 0) },
    { label: 'Conversao', value: `${String(summary.conversao ?? 0)}%` },
    { label: 'Periodo', value: `${String(summary.periodDays ?? 30)} dias` },
  ];
}

export interface SendMessageInfo {
  phone: string;
  channel: string;
  preview: string;
}

/**
 * Reads the `send_message_via_channel` payload into a flat info object.
 * Falsy/missing fields fall back to safe defaults.
 */
export function readSendMessageInfo(data: unknown): SendMessageInfo {
  const info = isRecord(data) ? data : null;
  return {
    phone: String(info?.phone ?? '-'),
    channel: String(info?.channel ?? 'whatsapp'),
    preview: String(info?.messagePreview ?? ''),
  };
}

/**
 * Resolves the currently visible assistant text from a list of
 * versioned responses, falling back to the canonical message text
 * when the version slot is missing or empty.
 */
export function resolveVisibleAssistantText(
  versions: Array<{ content?: string | null | undefined }>,
  activeIndex: number,
  fallback: string,
): string {
  const slot = versions[activeIndex];
  return slot?.content || fallback;
}

/**
 * `<textarea>` row count for the user-edit panel. Matches the original
 * `Math.max(3, Math.min(10, lines + 1))` heuristic so the visual
 * contract is preserved.
 */
export function computeEditTextareaRows(text: string): number {
  return Math.max(3, Math.min(10, text.split('\n').length + 1));
}

/**
 * True when the user-edit "Salvar" button should be enabled. The
 * original component disables on busy/empty/unchanged input — this
 * helper centralises that rule.
 */
export function canSubmitUserEdit(isBusy: boolean, draftText: string, currentText: string): boolean {
  const trimmed = draftText.trim();
  if (isBusy || !trimmed) {
    return false;
  }
  return trimmed !== currentText.trim();
}

/** True when the assistant action bar should render. */
export function shouldShowAssistantActions(
  isThinking: boolean,
  hasVisibleAssistantText: boolean,
): boolean {
  return !isThinking && hasVisibleAssistantText;
}

/** True when the "Kloel está pensando" placeholder should render. */
export function shouldShowThinkingPlaceholder(
  isThinking: boolean,
  hasVisibleAssistantText: boolean,
): boolean {
  return isThinking && !hasVisibleAssistantText;
}
