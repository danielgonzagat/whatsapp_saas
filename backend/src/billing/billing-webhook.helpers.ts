/**
 * Pure helper functions for BillingWebhookService.
 * Extracted to keep the service file under the architecture line budget.
 */
import { Logger } from '@nestjs/common';
import { FinancialAlertService } from '../common/financial-alert.service';
import { getTraceHeaders } from '../common/trace-headers';
import { PrismaService } from '../prisma/prisma.service';
import type { StripeCheckoutSession, StripeInvoice } from './stripe-types';
import type { StripeInvoiceWithSubscription, WhatsappNotifier } from './billing-webhook.types';

const FALLBACK_PLAN_PRICES: Record<string, number> = {
  STARTER: 97,
  PRO: 297,
  ENTERPRISE: 997,
};

/** Extract subscription id from a Stripe invoice payload (string or object). */
export function readInvoiceSubscriptionId(invoice: StripeInvoice): string | null {
  const subscriptionRef = (invoice as StripeInvoiceWithSubscription).subscription;
  if (typeof subscriptionRef === 'string' && subscriptionRef.trim()) {
    return subscriptionRef;
  }
  if (
    subscriptionRef &&
    typeof subscriptionRef === 'object' &&
    typeof subscriptionRef.id === 'string' &&
    subscriptionRef.id.trim()
  ) {
    return subscriptionRef.id;
  }
  return null;
}

/** Map a Stripe subscription status string to the local lifecycle enum. */
export function mapStripeStatus(status: string | null | undefined): string {
  if (!status) return 'ACTIVE';
  const normalized = status.toLowerCase();
  if (['canceled', 'cancelled'].includes(normalized)) return 'CANCELED';
  if (['past_due', 'incomplete', 'unpaid'].includes(normalized)) return 'PAST_DUE';
  if (['trialing'].includes(normalized)) return 'TRIALING';
  return 'ACTIVE';
}

/** Send an ops webhook for billing lifecycle events (no-op if not configured). */
export async function notifyOpsHelper(
  logger: Logger,
  event: string,
  payload: Record<string, unknown>,
  financialAlert?: FinancialAlertService,
): Promise<void> {
  const webhook = process.env.OPS_WEBHOOK_URL || process.env.DLQ_WEBHOOK_URL || '';
  const globalFetch = (globalThis as Record<string, unknown>).fetch as
    | ((url: string, init?: Record<string, unknown>) => Promise<unknown>)
    | undefined;
  if (!webhook || !globalFetch) return;
  try {
    await globalFetch(webhook, {
      method: 'POST',
      headers: { ...getTraceHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: event,
        ...payload,
        at: new Date().toISOString(),
        env: process.env.NODE_ENV || 'dev',
      }),
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'unknown_error';
    logger.warn(`notifyOps billing error: ${errMsg}`);
    financialAlert?.reconciliationAlert('billing ops notification failed', {
      details: { event, error: errMsg },
    });
  }
}

/** Build the WhatsApp confirmation message text. */
function buildConfirmationMessage(
  plan: string,
  formattedAmount: string,
  paymentIntentId: string,
): string {
  return `Pagamento confirmado.\n\nObrigado por assinar o plano *${plan}*!\n\nValor: R$ ${formattedAmount}\nID: ${paymentIntentId}\n\nSua conta já está ativa com todas as funcionalidades do plano. Se precisar de ajuda, é só me chamar aqui.`;
}

/** Resolve customer phone from session email + workspace contacts. */
async function resolveCustomerPhone(
  prisma: PrismaService,
  workspaceId: string,
  session: StripeCheckoutSession,
): Promise<string | null> {
  const customerEmail = session.customer_email || session.customer_details?.email;
  if (!customerEmail) return null;
  const contact = await prisma.contact.findFirst({
    where: { workspaceId, email: customerEmail },
    select: { phone: true },
  });
  return contact?.phone || null;
}

/** Send the post-payment WhatsApp confirmation to the buyer (best-effort). */
export async function notifyCustomerPaymentConfirmedHelper(
  logger: Logger,
  prisma: PrismaService,
  whatsappService: WhatsappNotifier | null,
  workspaceId: string,
  session: StripeCheckoutSession,
  plan: string,
  financialAlert?: FinancialAlertService,
): Promise<void> {
  if (!whatsappService) {
    logger.log('WhatsappService não disponível para notificação');
    return;
  }
  try {
    const phone = await resolveCustomerPhone(prisma, workspaceId, session);
    if (!phone) {
      logger.log(`Nenhum telefone encontrado para notificar workspace ${workspaceId}`);
      return;
    }
    let amount = session.amount_total ? session.amount_total / 100 : 0;
    if (!amount) amount = FALLBACK_PLAN_PRICES[plan.toUpperCase()] || 0;
    const formattedAmount = amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const paymentIntentId =
      typeof session.payment_intent === 'string' ? session.payment_intent : session.id;
    const message = buildConfirmationMessage(plan, formattedAmount, paymentIntentId);
    await whatsappService.sendMessage(workspaceId, phone, message);
    logger.log(`Notificação de pagamento enviada para ${phone}`);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'unknown_error';
    logger.warn(`Erro ao notificar cliente: ${errorMessage}`);
    financialAlert?.reconciliationAlert('billing customer notification failed', {
      workspaceId,
      details: { plan, error: errorMessage },
    });
  }
}
