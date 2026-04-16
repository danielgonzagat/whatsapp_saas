import { createHmac, timingSafeEqual } from 'node:crypto';

type MaybeHeader = string | string[] | undefined | null;

export function parseMercadoPagoSignatureHeader(header: MaybeHeader) {
  const raw = Array.isArray(header) ? header[0] : header;
  const parts = String(raw || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  let ts: string | null = null;
  let v1: string | null = null;

  for (const part of parts) {
    const [key, ...valueParts] = part.split('=');
    const value = valueParts.join('=').trim();
    const normalizedKey = String(key || '')
      .trim()
      .toLowerCase();

    if (!value) continue;
    if (normalizedKey === 'ts') ts = value;
    if (normalizedKey === 'v1') v1 = value.toLowerCase();
  }

  return { ts, v1 };
}

export function buildMercadoPagoWebhookManifest(params: {
  dataId?: string | null;
  requestId?: string | null;
  ts?: string | null;
}) {
  const segments: string[] = [];

  if (params.dataId) segments.push(`id:${params.dataId};`);
  if (params.requestId) segments.push(`request-id:${params.requestId};`);
  if (params.ts) segments.push(`ts:${params.ts};`);

  return segments.join('');
}

export function verifyMercadoPagoWebhookSignature(params: {
  secret?: string | null;
  signature?: MaybeHeader;
  requestId?: MaybeHeader;
  dataId?: string | null;
}) {
  const secret = String(params.secret || '').trim();
  const requestId = String(
    Array.isArray(params.requestId) ? params.requestId[0] : params.requestId || '',
  ).trim();
  const dataId = String(params.dataId || '').trim();
  const { ts, v1 } = parseMercadoPagoSignatureHeader(params.signature);

  if (!secret) {
    return {
      valid: false,
      reason: 'missing_secret',
      ts,
      receivedSignature: v1,
      expectedSignature: null,
      manifest: '',
    };
  }

  if (!v1) {
    return {
      valid: false,
      reason: 'missing_v1',
      ts,
      receivedSignature: null,
      expectedSignature: null,
      manifest: '',
    };
  }

  const manifest = buildMercadoPagoWebhookManifest({
    dataId,
    requestId,
    ts,
  });

  if (!manifest) {
    return {
      valid: false,
      reason: 'missing_manifest',
      ts,
      receivedSignature: v1,
      expectedSignature: null,
      manifest,
    };
  }

  const expectedSignature = createHmac('sha256', secret)
    .update(manifest)
    .digest('hex')
    .toLowerCase();

  const receivedBuffer = Buffer.from(v1, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

  const valid =
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer);

  return {
    valid,
    reason: valid ? 'ok' : 'signature_mismatch',
    ts,
    receivedSignature: v1,
    expectedSignature,
    manifest,
  };
}
