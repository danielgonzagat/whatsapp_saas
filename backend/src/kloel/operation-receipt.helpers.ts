import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';

const REPO_ROOT = path.resolve(process.cwd(), '..');
const WORLD_DIR = path.join(REPO_ROOT, '.world');
const LEDGER_PATH = path.join(WORLD_DIR, 'WORLD_LEDGER.jsonl');

export interface OperationReceipt {
  actionId: string;
  workspaceId: string;
  userId?: string;
  channel: string;
  entityType: string;
  entityId?: string;
  actionName: string;
  input: Record<string, unknown>;
  before?: unknown;
  after?: unknown;
  status: 'success' | 'failed' | 'blocked';
  proof?: string;
  auditLogId?: string;
  eventIds?: string[];
  createdAt: string;
  warnings?: string[];
  nextPossibleActions?: string[];
}

/** Maps tool names to entity types for the receipt */
function classifyEntityType(toolName: string): string {
  if (/product|produto/.test(toolName)) {
    return 'product';
  }
  if (/plan/.test(toolName)) {
    return 'plan';
  }
  if (/checkout/.test(toolName)) {
    return 'checkout';
  }
  if (/coupon/.test(toolName)) {
    return 'coupon';
  }
  if (/payment|pix|boleto/.test(toolName)) {
    return 'payment';
  }
  if (/wallet|balance|statement|withdrawal|saque|saldo|extrato/.test(toolName)) {
    return 'wallet';
  }
  if (/order|venda|sale|abandonment/.test(toolName)) {
    return 'order';
  }
  if (/lead|crm|pipeline/.test(toolName)) {
    return 'lead';
  }
  if (/whatsapp|message|chat/.test(toolName)) {
    return 'messaging';
  }
  if (/config|setting|theme|fiscal|business/.test(toolName)) {
    return 'config';
  }
  if (/upload|document|image|foto/.test(toolName)) {
    return 'document';
  }
  if (/codegraph|git_|code_|build_|test_|search_code|read_prisma/.test(toolName)) {
    return 'code';
  }
  if (/affiliate|marketplace/.test(toolName)) {
    return 'affiliate';
  }
  if (/social|channel|instagram|facebook|tiktok/.test(toolName)) {
    return 'channel';
  }
  if (/broadcast|campaign|pixel|marketing/.test(toolName)) {
    return 'marketing';
  }
  if (/url/.test(toolName)) {
    return 'url';
  }
  return 'generic';
}

export function buildReceipt(params: {
  workspaceId: string;
  toolName: string;
  args: Record<string, unknown>;
  result: { success: boolean; [key: string]: unknown };
  userId?: string;
  channel?: string;
}): OperationReceipt {
  const entityId: string | undefined =
    typeof params.result.id === 'string'
      ? params.result.id
      : typeof params.result.paymentId === 'string'
        ? params.result.paymentId
        : typeof params.result.saleId === 'string'
          ? params.result.saleId
          : undefined;

  const proof = params.result.success ? `tool_${params.toolName}_executed` : undefined;
  const warnings = params.result.error ? [String(params.result.error)] : undefined;
  const nextPossibleActions = suggestNextActions(params.toolName, params.result.success);

  return {
    actionId: randomUUID(),
    workspaceId: params.workspaceId,
    ...(params.userId !== undefined && { userId: params.userId }),
    channel: params.channel || 'web',
    entityType: classifyEntityType(params.toolName),
    ...(entityId !== undefined && { entityId }),
    actionName: params.toolName,
    input: sanitizeInput(params.args),
    status: params.result.success ? 'success' : 'failed',
    ...(proof !== undefined && { proof }),
    createdAt: new Date().toISOString(),
    ...(warnings !== undefined && { warnings }),
    ...(nextPossibleActions !== undefined && { nextPossibleActions }),
  };
}

function sanitizeInput(args: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (k === 'password' || k === 'secret' || k === 'apiKey' || k === 'token') {
      continue;
    }
    if (typeof v === 'string' && v.length > 500) {
      safe[k] = v.slice(0, 500) + '...';
    } else {
      safe[k] = v;
    }
  }
  return safe;
}

function suggestNextActions(toolName: string, success: boolean): string[] | undefined {
  if (!success) {
    return undefined;
  }
  const suggestions: Record<string, string[]> = {
    create_product: ['Editar detalhes', 'Criar plano', 'Criar checkout'],
    create_plan: ['Editar plano', 'Criar checkout', 'Configurar frete'],
    create_checkout: ['Adicionar URL', 'Configurar pixel', 'Vincular planos'],
    create_coupon: ['Listar cupons', 'Criar checkout com cupom'],
    create_payment_link: ['Verificar pagamento', 'Ver extrato'],
    generate_boleto: ['Verificar pagamento', 'Ver extrato'],
  };
  return suggestions[toolName];
}

/** Extract key result data for spine event enrichment */
export function buildResultMeta(
  toolName: string,
  result: Record<string, unknown>,
): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  const outputs =
    result.outputs && typeof result.outputs === 'object' && !Array.isArray(result.outputs)
      ? (result.outputs as Record<string, unknown>)
      : undefined;
  const paymentSources: Record<string, unknown>[] = outputs ? [result, outputs] : [result];
  const readPaymentString = (...keys: string[]): string | undefined => {
    for (const source of paymentSources) {
      for (const key of keys) {
        const value = source[key];
        if (typeof value === 'string' && value.trim()) {
          return value;
        }
      }
    }
    return undefined;
  };
  const copyPaymentString = (targetKey: string, ...sourceKeys: string[]): string | undefined => {
    const value = readPaymentString(...sourceKeys);
    if (value !== undefined) {
      meta[targetKey] = value;
    }
    return value;
  };

  // Products
  if (typeof result.product === 'object' && result.product) {
    const p = result.product as Record<string, unknown>;
    if (p.name) {
      meta.productName = p.name;
    }
    if (p.price !== undefined) {
      meta.productPrice = p.price;
    }
  }
  // Sales/Orders
  if (typeof result.totalSales === 'number') {
    meta.totalSales = result.totalSales;
  }
  if (typeof result.totalAmount === 'number') {
    meta.totalAmount = result.totalAmount;
  }
  if (typeof result.count === 'number') {
    meta.count = result.count;
  }
  if (Array.isArray(result.items)) {
    meta.itemCount = (result.items as Array<unknown>).length;
    // For abandonments, extract lead info
    if (toolName === 'get_abandonments') {
      const items = result.items as Array<Record<string, unknown>>;
      meta.abandonmentCount = items.length;
      if (items.length > 0) {
        meta.abandonedLeads = items.slice(0, 5).map((i) => ({
          name: i.leadName || i.productName,
          amount: i.amount,
        }));
      }
    }
  }
  // Payments
  copyPaymentString('paymentId', 'paymentId');
  copyPaymentString('saleId', 'saleId');
  const pixCopyPaste = copyPaymentString('pixCopyPaste', 'pixCopyPaste');
  const pixCopiaECola = copyPaymentString('pixCopiaECola', 'pixCopiaECola');
  const pixQrCode = copyPaymentString('pixQrCode', 'pixQrCode');
  const qrCodeBase64 = copyPaymentString('qrCodeBase64', 'qrCodeBase64');
  const paymentUrl = copyPaymentString('paymentUrl', 'paymentUrl', 'paymentLink');
  const paymentLink = copyPaymentString('paymentLink', 'paymentLink');
  if (pixCopyPaste || pixCopiaECola || pixQrCode || qrCodeBase64 || paymentUrl || paymentLink) {
    meta.hasPix = true;
  }
  const boletoCode = copyPaymentString('boletoCode', 'boletoCode', 'barcode');
  const boletoBarcode = copyPaymentString('boletoBarcode', 'boletoBarcode', 'barcode');
  const boletoPdfUrl = copyPaymentString('boletoPdfUrl', 'boletoPdfUrl', 'pdfUrl');
  const boletoUrl = copyPaymentString('boletoUrl', 'boletoUrl', 'paymentUrl', 'paymentLink');
  if (boletoCode || boletoBarcode || boletoPdfUrl || boletoUrl) {
    meta.hasBoleto = true;
  }
  const customerName = copyPaymentString('customerName', 'customerName', 'buyerName');
  if (customerName !== undefined) {
    meta.customerName = customerName;
  }
  // Wallet
  if (typeof result.balance === 'object' && result.balance) {
    const b = result.balance as Record<string, unknown>;
    if (typeof b.available === 'number') {
      meta.availableBalance = b.available;
    }
    if (typeof b.pending === 'number') {
      meta.pendingBalance = b.pending;
    }
  }
  // Coupons
  if (typeof result.coupon === 'object' && result.coupon) {
    const c = result.coupon as Record<string, unknown>;
    if (c.code) {
      meta.couponCode = c.code;
    }
  }
  // Plans
  if (typeof result.plan === 'object' && result.plan) {
    const pl = result.plan as Record<string, unknown>;
    if (pl.name) {
      meta.planName = pl.name;
    }
    if (pl.price !== undefined) {
      meta.planPrice = pl.price;
    }
  }
  // Checkouts
  if (typeof result.checkout === 'object' && result.checkout) {
    const co = result.checkout as Record<string, unknown>;
    if (co.name) {
      meta.checkoutName = co.name;
    }
  }
  return meta;
}
export async function writeOperationReceipt(receipt: OperationReceipt): Promise<void> {
  try {
    await fs.mkdir(WORLD_DIR, { recursive: true });
    const line = JSON.stringify(receipt) + '\n';
    await fs.appendFile(LEDGER_PATH, line, 'utf-8');
  } catch {
    // Non-blocking: receipt write failure should never break tool execution
  }
}

/**
 * Structural sink for persisting a receipt into the durable AuditLog (DB).
 *
 * Intentionally typed structurally (not as `AuditService`) so the receipt
 * helpers stay free of NestJS/Prisma coupling and remain unit-testable, and
 * so callers can inject the real `AuditService` (which maps to the
 * `RAC_AuditLog` table) without a circular import.
 */
export interface AuditLogSink {
  log(data: {
    workspaceId: string;
    action: string;
    resource: string;
    resourceId?: string;
    agentId?: string;
    details?: Record<string, unknown>;
  }): Promise<void>;
}

/**
 * Persist an operation receipt to the durable AuditLog (DB / `RAC_AuditLog`).
 *
 * This is the production source of truth for "what action did the organism
 * actually execute". The JSONL ledger (`writeOperationReceipt`) remains a
 * local-debug append-only trace; the DB row is the queryable, workspace-scoped
 * audit record. Never throws — receipt persistence must not break a reply.
 */
export async function persistReceiptToAuditLog(
  audit: AuditLogSink | undefined,
  receipt: OperationReceipt,
): Promise<void> {
  if (!audit) {
    return;
  }
  try {
    await audit.log({
      workspaceId: receipt.workspaceId,
      action: receipt.actionName,
      resource: receipt.entityType,
      ...(receipt.entityId !== undefined ? { resourceId: receipt.entityId } : {}),
      ...(receipt.userId !== undefined ? { agentId: receipt.userId } : {}),
      details: { ...(receipt as unknown as Record<string, unknown>), channel: receipt.channel },
    });
  } catch {
    // Non-blocking: audit persistence failure must never break tool execution.
  }
}

/**
 * Write an operation receipt to BOTH durable sinks: the queryable AuditLog (DB)
 * when an `audit` sink is provided, and the local JSONL ledger. Prefer this over
 * the bare `writeOperationReceipt` on every real action path so the receipt is
 * persisted in the database, not only in `WORLD_LEDGER.jsonl`.
 */
export async function writeOperationReceiptWithAudit(
  receipt: OperationReceipt,
  audit?: AuditLogSink,
): Promise<void> {
  await Promise.all([writeOperationReceipt(receipt), persistReceiptToAuditLog(audit, receipt)]);
}

/**
 * Verbs that indicate a mutation a user must explicitly confirm before the
 * organism executes it on the authenticated tool-call (LLM) path. Aligns with
 * the canonical `MUTATION_SENSITIVE` capability category: money, documents,
 * external sends, destructive edits.
 */
const MUTATION_SENSITIVE_VERB_RE =
  /(?:^|[._-])(?:create|update|delete|remove|send|charge|pay|payout|refund|transfer|issue|cancel|publish|deploy|execute|generate_payment|gerar_pagamento|criar|enviar|cobrar|estornar|excluir|deletar|cancelar|emitir)(?:$|[._-])/i;

/**
 * Best-effort name-based classifier for whether a tool is mutation-sensitive.
 * Used as a SAFE-BY-DEFAULT fallback on the LLM tool_call path when the caller
 * does not supply an explicit registry-derived sensitive set. Read/query tools
 * (get/list/search/read/count/fetch/lookup) are treated as safe.
 */
export function isMutationSensitiveTool(toolName: string): boolean {
  const name = String(toolName || '').toLowerCase();
  if (!name) {
    return false;
  }
  if (/(?:^|[._-])(?:get|list|search|read|count|fetch|lookup|view|describe|status|consultar|listar|buscar)(?:$|[._-])/.test(name)) {
    return false;
  }
  return MUTATION_SENSITIVE_VERB_RE.test(name);
}
