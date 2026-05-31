import type { ActionDescriptor } from '../risk-class/risk-class.types';

/** Infer an ActionDescriptor from user message and concept detections. */
export function inferActionDescriptor(
  userMessage: string,
  concepts: Array<{ concept: string; confidence: number }> | undefined,
): ActionDescriptor {
  const normalized = userMessage.toLowerCase();

  const hasPayment =
    /\b(pagamento|pagar|pix|cobrança|boleto|cartão|preço|valor|desconto|cupom|reembolso|financial|payment)\b/.test(
      normalized,
    );
  const hasBlock = /\b(bloquear|suspender|banir|remover)\b/.test(normalized);
  const hasPublic = /\b(público|postar|publicar|anunciar|divulgar)\b/.test(normalized);

  const hasFinancialConcept = concepts?.some((c) =>
    /(price|payment|discount|financial|fee|charge|money)/i.test(c.concept),
  );

  if (hasBlock) {
    return { kind: 'lead_block', target: 'lead', reversible: true };
  }

  if (hasPayment || hasFinancialConcept) {
    return { kind: 'payment_action', target: 'lead', reversible: true, financialImpactCents: 0 };
  }

  if (hasPublic) {
    return { kind: 'public_response', target: 'public', reversible: true };
  }

  return { kind: 'message_send', target: 'lead', reversible: true };
}
