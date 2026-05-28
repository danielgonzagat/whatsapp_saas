import { createHash } from 'node:crypto';

export const MP_WEBHOOK_PATH = '/webhooks/mercadopago';
export const PIX_EXPIRATION_MINUTES = 30;

export function resolveBackendOrigin(): string {
  const raw =
    process.env.BACKEND_PUBLIC_URL ||
    process.env.PUBLIC_BACKEND_URL ||
    process.env.BACKEND_URL ||
    process.env.API_PUBLIC_URL ||
    process.env.APP_URL ||
    'http://localhost:3001';
  const trimmed = raw.replace(/\/+$/, '');
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function toPixQrCodeDataUrl(qrCodeBase64: string): string | undefined {
  return qrCodeBase64 ? `data:image/png;base64,${qrCodeBase64}` : undefined;
}

export function buildPaymentIdempotencyKey(data: {
  workspaceId: string;
  leadId: string;
  customerPhone: string;
  customerEmail?: string;
  description: string;
  amountInCents: number;
  idempotencyKey?: string;
}): string {
  const explicit = data.idempotencyKey?.trim();
  if (explicit) {
    return explicit;
  }

  return `kloel-payment:${createHash('sha256')
    .update(
      [
        data.workspaceId,
        data.leadId,
        data.customerPhone,
        data.customerEmail ?? '',
        data.description,
        String(data.amountInCents),
      ].join('|'),
    )
    .digest('hex')}`;
}
