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
  if (/product|produto/.test(toolName)) return 'product';
  if (/plan/.test(toolName)) return 'plan';
  if (/checkout/.test(toolName)) return 'checkout';
  if (/coupon/.test(toolName)) return 'coupon';
  if (/payment|pix|boleto/.test(toolName)) return 'payment';
  if (/wallet|balance|statement|withdrawal|saque|saldo|extrato/.test(toolName)) return 'wallet';
  if (/order|venda|sale|abandonment/.test(toolName)) return 'order';
  if (/lead|crm|pipeline/.test(toolName)) return 'lead';
  if (/whatsapp|message|chat/.test(toolName)) return 'messaging';
  if (/config|setting|theme|fiscal|business/.test(toolName)) return 'config';
  if (/upload|document|image|foto/.test(toolName)) return 'document';
  if (/codegraph|git_|code_|build_|test_|search_code|read_prisma/.test(toolName)) return 'code';
  if (/affiliate|marketplace/.test(toolName)) return 'affiliate';
  if (/social|channel|instagram|facebook|tiktok/.test(toolName)) return 'channel';
  if (/broadcast|campaign|pixel|marketing/.test(toolName)) return 'marketing';
  if (/url/.test(toolName)) return 'url';
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
  const entityId: string | undefined = typeof params.result.id === 'string' ? params.result.id
    : typeof params.result.paymentId === 'string' ? params.result.paymentId
    : typeof params.result.saleId === 'string' ? params.result.saleId
    : undefined;

  return {
    actionId: randomUUID(),
    workspaceId: params.workspaceId,
    userId: params.userId,
    channel: params.channel || 'web',
    entityType: classifyEntityType(params.toolName),
    entityId,
    actionName: params.toolName,
    input: sanitizeInput(params.args),
    status: params.result.success ? 'success' : 'failed',
    proof: params.result.success ? `tool_${params.toolName}_executed` : undefined,
    createdAt: new Date().toISOString(),
    warnings: params.result.error ? [String(params.result.error)] : undefined,
    nextPossibleActions: suggestNextActions(params.toolName, params.result.success),
  };
}

function sanitizeInput(args: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (k === 'password' || k === 'secret' || k === 'apiKey' || k === 'token') continue;
    if (typeof v === 'string' && v.length > 500) safe[k] = v.slice(0, 500) + '...';
    else safe[k] = v;
  }
  return safe;
}

function suggestNextActions(toolName: string, success: boolean): string[] | undefined {
  if (!success) return undefined;
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
export function buildResultMeta(toolName: string, result: Record<string, unknown>): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  // Products
  if (typeof result.product === 'object' && result.product) {
    const p = result.product as Record<string, unknown>;
    if (p.name) meta.productName = p.name;
    if (p.price !== undefined) meta.productPrice = p.price;
  }
  // Sales/Orders
  if (typeof result.totalSales === 'number') meta.totalSales = result.totalSales;
  if (typeof result.totalAmount === 'number') meta.totalAmount = result.totalAmount;
  if (typeof result.count === 'number') meta.count = result.count;
  if (Array.isArray(result.items)) {
    meta.itemCount = (result.items as Array<unknown>).length;
    // For abandonments, extract lead info
    if (toolName === 'get_abandonments') {
      const items = result.items as Array<Record<string, unknown>>;
      meta.abandonmentCount = items.length;
      if (items.length > 0) {
        meta.abandonedLeads = items.slice(0, 5).map(i => ({
          name: i.leadName || i.productName,
          amount: i.amount,
        }));
      }
    }
  }
  // Payments
  if (typeof result.paymentId === 'string') meta.paymentId = result.paymentId;
  if (typeof result.pixCopyPaste === 'string') meta.hasPix = true;
  if (typeof result.boletoCode === 'string') meta.hasBoleto = true;
  if (typeof result.customerName === 'string') meta.customerName = result.customerName;
  // Wallet
  if (typeof result.balance === 'object' && result.balance) {
    const b = result.balance as Record<string, unknown>;
    if (typeof b.available === 'number') meta.availableBalance = b.available;
    if (typeof b.pending === 'number') meta.pendingBalance = b.pending;
  }
  // Coupons
  if (typeof result.coupon === 'object' && result.coupon) {
    const c = result.coupon as Record<string, unknown>;
    if (c.code) meta.couponCode = c.code;
  }
  // Plans
  if (typeof result.plan === 'object' && result.plan) {
    const pl = result.plan as Record<string, unknown>;
    if (pl.name) meta.planName = pl.name;
    if (pl.price !== undefined) meta.planPrice = pl.price;
  }
  // Checkouts
  if (typeof result.checkout === 'object' && result.checkout) {
    const co = result.checkout as Record<string, unknown>;
    if (co.name) meta.checkoutName = co.name;
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
