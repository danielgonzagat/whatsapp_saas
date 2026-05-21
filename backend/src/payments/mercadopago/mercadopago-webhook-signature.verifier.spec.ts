import { createHmac } from 'node:crypto';

import { MercadoPagoConfigService } from './mercadopago.config';
import { MercadoPagoWebhookSignatureVerifier } from './mercadopago-webhook-signature.verifier';

/**
 * Tests for the MercadoPago webhook signature verifier.
 *
 * Critical property: the verifier MUST refuse any of:
 * - missing/malformed `x-signature`
 * - expired `ts` (>10min)
 * - tampered body (`data.id` mismatch)
 * - tampered signature
 * - missing webhook secret
 *
 * and MUST accept a freshly-signed payload with the configured secret.
 */

const TEST_SECRET = 'test-webhook-secret-xyz';
const TEST_REQUEST_ID = 'a3d7-b14f-99cc';
const TEST_DATA_ID = '12345678';

function buildVerifier(opts: { secret?: string } = {}): MercadoPagoWebhookSignatureVerifier {
  const { secret = TEST_SECRET } = opts;
  process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-test';
  process.env.MERCADOPAGO_PUBLIC_KEY = 'APP_USR-pk-test';
  process.env.MERCADOPAGO_WEBHOOK_SECRET = secret;
  process.env.MERCADOPAGO_SANDBOX = 'true';
  const config = new MercadoPagoConfigService();
  return new MercadoPagoWebhookSignatureVerifier(config);
}

function signManifest(secret: string, dataId: string, requestId: string, ts: number): string {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac('sha256', secret).update(manifest).digest('hex');
  return `ts=${ts},v1=${v1}`;
}

describe('MercadoPagoWebhookSignatureVerifier', () => {
  const fixedNow = 1_700_000_000_000;
  // MP sends `ts` in EPOCH MILLISECONDS (confirmed via MP webhook docs).
  // Earlier this fixture used `Math.floor(fixedNow / 1000)` (seconds) — that
  // matched a buggy verifier impl. Both are now corrected.
  const fixedTs = fixedNow;

  afterEach(() => {
    delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    delete process.env.MERCADOPAGO_PUBLIC_KEY;
    delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
    delete process.env.MERCADOPAGO_SANDBOX;
  });

  it('accepts a freshly-signed payload', () => {
    const v = buildVerifier();
    const sigHeader = signManifest(TEST_SECRET, TEST_DATA_ID, TEST_REQUEST_ID, fixedTs);
    expect(
      v.verify({
        signatureHeader: sigHeader,
        requestId: TEST_REQUEST_ID,
        dataId: TEST_DATA_ID,
        nowMs: fixedNow,
      }),
    ).toEqual({ ok: true });
  });

  it('refuses missing x-signature header', () => {
    const v = buildVerifier();
    const res = v.verify({
      signatureHeader: undefined,
      requestId: TEST_REQUEST_ID,
      dataId: TEST_DATA_ID,
      nowMs: fixedNow,
    });
    expect(res).toEqual({ ok: false, reason: 'missing_x_signature' });
  });

  it('refuses missing x-request-id', () => {
    const v = buildVerifier();
    const sigHeader = signManifest(TEST_SECRET, TEST_DATA_ID, TEST_REQUEST_ID, fixedTs);
    const res = v.verify({
      signatureHeader: sigHeader,
      requestId: undefined,
      dataId: TEST_DATA_ID,
      nowMs: fixedNow,
    });
    expect(res).toEqual({ ok: false, reason: 'missing_x_request_id' });
  });

  it('refuses missing data.id', () => {
    const v = buildVerifier();
    const sigHeader = signManifest(TEST_SECRET, TEST_DATA_ID, TEST_REQUEST_ID, fixedTs);
    const res = v.verify({
      signatureHeader: sigHeader,
      requestId: TEST_REQUEST_ID,
      dataId: undefined,
      nowMs: fixedNow,
    });
    expect(res).toEqual({ ok: false, reason: 'missing_data_id' });
  });

  it('refuses malformed signature header', () => {
    const v = buildVerifier();
    const res = v.verify({
      signatureHeader: 'garbage-no-equals',
      requestId: TEST_REQUEST_ID,
      dataId: TEST_DATA_ID,
      nowMs: fixedNow,
    });
    expect(res).toEqual({ ok: false, reason: 'malformed_x_signature' });
  });

  it('refuses expired ts (>10min old)', () => {
    const v = buildVerifier();
    const oldTs = fixedTs - 11 * 60 * 1000; // 11 minutes ago, in ms
    const sigHeader = signManifest(TEST_SECRET, TEST_DATA_ID, TEST_REQUEST_ID, oldTs);
    const res = v.verify({
      signatureHeader: sigHeader,
      requestId: TEST_REQUEST_ID,
      dataId: TEST_DATA_ID,
      nowMs: fixedNow,
    });
    expect(res).toEqual({ ok: false, reason: 'expired_ts' });
  });

  it('refuses tampered data.id', () => {
    const v = buildVerifier();
    const sigHeader = signManifest(TEST_SECRET, TEST_DATA_ID, TEST_REQUEST_ID, fixedTs);
    const res = v.verify({
      signatureHeader: sigHeader,
      requestId: TEST_REQUEST_ID,
      dataId: '99999999', // wrong id
      nowMs: fixedNow,
    });
    expect(res).toEqual({ ok: false, reason: 'sig_mismatch' });
  });

  it('refuses signature signed with different secret', () => {
    const v = buildVerifier({ secret: TEST_SECRET });
    const sigHeader = signManifest('attacker-secret', TEST_DATA_ID, TEST_REQUEST_ID, fixedTs);
    const res = v.verify({
      signatureHeader: sigHeader,
      requestId: TEST_REQUEST_ID,
      dataId: TEST_DATA_ID,
      nowMs: fixedNow,
    });
    expect(res).toEqual({ ok: false, reason: 'sig_mismatch' });
  });

  it('refuses when webhook secret is unset', () => {
    const v = buildVerifier({ secret: '' });
    const sigHeader = signManifest('dummy', TEST_DATA_ID, TEST_REQUEST_ID, fixedTs);
    const res = v.verify({
      signatureHeader: sigHeader,
      requestId: TEST_REQUEST_ID,
      dataId: TEST_DATA_ID,
      nowMs: fixedNow,
    });
    expect(res).toEqual({ ok: false, reason: 'webhook_secret_unset' });
  });

  it('refuses signature with non-hex characters', () => {
    const v = buildVerifier();
    const res = v.verify({
      signatureHeader: `ts=${fixedTs},v1=ZZZZ-not-hex`,
      requestId: TEST_REQUEST_ID,
      dataId: TEST_DATA_ID,
      nowMs: fixedNow,
    });
    // Buffer.from('ZZZZ', 'hex') silently returns empty buffer → length mismatch
    expect(res).toEqual({ ok: false, reason: 'sig_length_mismatch' });
  });

  it('refuses when MP is not configured', () => {
    delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    delete process.env.MERCADOPAGO_PUBLIC_KEY;
    const config = new MercadoPagoConfigService();
    const v = new MercadoPagoWebhookSignatureVerifier(config);
    const res = v.verify({
      signatureHeader: 'ts=1,v1=abc',
      requestId: TEST_REQUEST_ID,
      dataId: TEST_DATA_ID,
    });
    expect(res).toEqual({ ok: false, reason: 'mp_not_configured' });
  });

  it('lowercases alphanumeric data.id in the manifest (MP spec)', () => {
    // MP docs: "This query param can be found in the notification received
    // in uppercase, but it must be used in lowercase". Order IDs are
    // alphanumeric so case matters; payment IDs are numeric (no-op).
    const v = buildVerifier();
    const upperDataId = 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3';
    // Signature must be generated against the LOWERCASE version
    const sigHeader = signManifest(
      TEST_SECRET,
      upperDataId.toLowerCase(),
      TEST_REQUEST_ID,
      fixedTs,
    );
    expect(
      v.verify({
        signatureHeader: sigHeader,
        requestId: TEST_REQUEST_ID,
        dataId: upperDataId, // verifier receives uppercase from body/url
        nowMs: fixedNow,
      }),
    ).toEqual({ ok: true });
  });

  it('accepts fresh ts in milliseconds (within 10min window)', () => {
    // Regression test: earlier impl multiplied ts by 1000 assuming seconds.
    // MP sends epoch ms directly; this test locks in the unit.
    const v = buildVerifier();
    const tsMs = fixedNow - 5 * 60 * 1000; // 5 min ago
    const sigHeader = signManifest(TEST_SECRET, TEST_DATA_ID, TEST_REQUEST_ID, tsMs);
    expect(
      v.verify({
        signatureHeader: sigHeader,
        requestId: TEST_REQUEST_ID,
        dataId: TEST_DATA_ID,
        nowMs: fixedNow,
      }),
    ).toEqual({ ok: true });
  });
});
