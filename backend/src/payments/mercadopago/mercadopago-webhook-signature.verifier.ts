import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

import { MercadoPagoConfigService } from './mercadopago.config';

/**
 * Verifies the `x-signature` header that Mercado Pago sends with every
 * webhook (v2 webhook format documented at
 * https://www.mercadopago.com.br/developers/en/docs/your-integrations/notifications/webhooks).
 *
 * MP signs a `manifest` string of the form:
 *   id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 *
 * The signature header contains `ts=<ts>,v1=<hmac_sha256_hex>` where
 * `v1` is the HMAC-SHA256 over that manifest, keyed by the webhook
 * secret configured in the MP dashboard.
 *
 * This verifier:
 * 1. Refuses missing/malformed headers
 * 2. Refuses requests with `ts` older than `MAX_AGE_MS` (replay protection)
 * 3. Uses `timingSafeEqual` to compare HMAC digests (no early-exit
 *    timing side channel)
 * 4. Never logs the secret or the raw signature
 */
@Injectable()
export class MercadoPagoWebhookSignatureVerifier {
  private readonly logger = new Logger(MercadoPagoWebhookSignatureVerifier.name);

  /** Reject webhooks older than 10 minutes (anti-replay window). */
  private static readonly MAX_AGE_MS = 10 * 60 * 1000;

  constructor(private readonly config: MercadoPagoConfigService) {}

  /**
   * Returns true iff the headers + payload constitute a valid MP webhook.
   *
   * @param signatureHeader - the value of `x-signature` (e.g.
   *   `ts=1700000000,v1=abcdef0123...`)
   * @param requestId - the value of `x-request-id`
   * @param dataId - the `data.id` from the parsed body (string-coerced)
   * @param nowMs - current epoch ms (injectable for tests)
   */
  verify(args: {
    signatureHeader: string | undefined;
    requestId: string | undefined;
    dataId: string | number | undefined;
    nowMs?: number;
  }): { ok: true } | { ok: false; reason: string } {
    if (!this.config.isAvailable()) {
      return { ok: false, reason: 'mp_not_configured' };
    }
    const { signatureHeader, requestId, dataId } = args;
    if (!signatureHeader) return { ok: false, reason: 'missing_x_signature' };
    if (!requestId) return { ok: false, reason: 'missing_x_request_id' };
    if (dataId === undefined || dataId === null || String(dataId).trim() === '') {
      return { ok: false, reason: 'missing_data_id' };
    }

    const parsed = parseSignatureHeader(signatureHeader);
    if (!parsed) return { ok: false, reason: 'malformed_x_signature' };

    const tsMs = parsed.ts * 1000;
    const nowMs = args.nowMs ?? Date.now();
    if (Math.abs(nowMs - tsMs) > MercadoPagoWebhookSignatureVerifier.MAX_AGE_MS) {
      return { ok: false, reason: 'expired_ts' };
    }

    const secret = this.config.get().webhookSecret;
    if (!secret) return { ok: false, reason: 'webhook_secret_unset' };

    const manifest = `id:${String(dataId)};request-id:${requestId};ts:${parsed.ts};`;
    const expectedHex = createHmac('sha256', secret).update(manifest).digest('hex');

    let actualBuf: Buffer;
    let expectedBuf: Buffer;
    try {
      actualBuf = Buffer.from(parsed.v1, 'hex');
      expectedBuf = Buffer.from(expectedHex, 'hex');
    } catch {
      return { ok: false, reason: 'hex_decode_failed' };
    }
    if (actualBuf.length !== expectedBuf.length) {
      return { ok: false, reason: 'sig_length_mismatch' };
    }
    if (!timingSafeEqual(actualBuf, expectedBuf)) {
      return { ok: false, reason: 'sig_mismatch' };
    }

    return { ok: true };
  }
}

/**
 * Parses `ts=<seconds>,v1=<hex>` (order-insensitive, tolerant of
 * additional fields).
 */
function parseSignatureHeader(header: string): { ts: number; v1: string } | null {
  const parts = header.split(',').map((p) => p.trim());
  let ts: number | null = null;
  let v1: string | null = null;
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 'ts') {
      const parsedTs = Number.parseInt(value, 10);
      if (Number.isFinite(parsedTs)) ts = parsedTs;
    } else if (key === 'v1') {
      v1 = value;
    }
  }
  if (ts === null || !v1) return null;
  return { ts, v1 };
}
