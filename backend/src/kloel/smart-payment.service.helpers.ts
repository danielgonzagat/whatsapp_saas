// @@index: pure helpers extracted from smart-payment.service.ts (Wave 105B)
// All functions are side-effect-free. No Prisma, no async, no I/O.

// Canonical BRL display formatter lives in `money-format.util`. Re-exported here
// so this module's internal callers and existing importers keep resolving while
// the duplicate definition is removed (byte-identical output).
import { formatBrlAmount } from './money-format.util';

export { formatBrlAmount };

/**
 * Normalize an amount into a stable key string (rounded to 2 decimal places).
 * Used by idempotency key construction so BRL 139.90 → "139.9".
 */
export function normalizeAmountKey(amount: number): string {
  const normalized = Number.isFinite(amount) ? amount : 0;
  return (Math.round(normalized * 100) / 100).toString();
}

/**
 * Truncate conversation history to the last 500 characters for prompt context.
 */
export function truncateConversationHistory(conversation?: string): string {
  return String(conversation || '').slice(-500);
}
export function buildSmartPaymentAiPrompt(params: {
  customerName: string;
  productName?: string;
  amount: number;
  conversation?: string;
}): string {
  return [
    'Você é um assistente de vendas. Gere uma mensagem WhatsApp curta e persuasiva para enviar um link de pagamento.',
    '',
    'Contexto:',
    `- Cliente: ${params.customerName}`,
    `- Produto: ${params.productName || 'Produto/Serviço'}`,
    `- Valor: ${formatBrlAmount(params.amount)}`,
    `- Histórico da conversa: ${truncateConversationHistory(params.conversation)}`,
    '',
    'Responda em JSON:',
    '{',
    '  "message": "Mensagem WhatsApp (max 200 chars)",',
    '  "paymentMethod": "PIX|BOLETO|CREDIT_CARD",',
    '  "urgencyLevel": "low|medium|high"',
    '}',
  ].join('\n');
}
export function buildNegotiationAiPrompt(params: {
  customerName?: string | null;
  leadScore?: number | null;
  purchaseProbability?: string | null;
  maxDiscount: number;
  minPurchaseForDiscount: number;
  originalAmount: number;
  contactMessage: string;
}): string {
  return [
    'Você é um gerente de vendas decidindo sobre um pedido de desconto.',
    '',
    'Contexto do cliente:',
    `- Nome: ${params.customerName || 'Desconhecido'}`,
    `- Lead Score: ${params.leadScore || 0}/100`,
    `- Probabilidade de compra: ${params.purchaseProbability || 'UNKNOWN'}`,
    '',
    'Regras de desconto:',
    `- Desconto máximo permitido: ${params.maxDiscount}%`,
    `- Valor mínimo para desconto: ${formatBrlAmount(params.minPurchaseForDiscount)}`,
    '',
    `Valor original: ${formatBrlAmount(params.originalAmount)}`,
    `Mensagem do cliente: "${params.contactMessage}"`,
    '',
    'Analise e responda em JSON:',
    '{',
    '  "approved": true/false,',
    `  "discountPercent": número (0 a ${params.maxDiscount}),`,
    '  "reason": "explicação curta",',
    '  "installments": número ou null,',
    '  "counterOffer": "mensagem de contra-oferta se não aprovado"',
    '}',
  ].join('\n');
}
export function buildPixReadyMessage(customerName: string, amount: number): string {
  return [
    `${customerName}, seu pagamento PIX de ${formatBrlAmount(amount)} está pronto.`,
    '',
    'Use o QR Code ou copie o código PIX abaixo.',
  ].join('\n');
}
export function buildConfirmedPaymentMessage(amount: number): string {
  return [
    `Pagamento de ${formatBrlAmount(amount)} confirmado. Obrigado pela compra.`,
    '',
    'Seu acesso e os próximos passos seguem pelo canal cadastrado.',
  ].join('\n');
}
export interface PaymentContext {
  workspaceId: string;
  contactId?: string;
  phone: string;
  customerName: string;
  customerEmail?: string;
  productName?: string;
  amount: number;
  conversation?: string;
}
export function buildSmartPaymentIdempotencyKey(context: PaymentContext): string {
  return [
    'smart-payment',
    context.workspaceId,
    context.contactId || context.phone,
    normalizeAmountKey(context.amount),
    context.productName || 'Pagamento KLOEL',
  ].join(':');
}
