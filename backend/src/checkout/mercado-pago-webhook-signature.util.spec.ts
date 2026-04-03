import * as crypto from 'crypto';
import {
  buildMercadoPagoWebhookManifest,
  parseMercadoPagoSignatureHeader,
  verifyMercadoPagoWebhookSignature,
} from './mercado-pago-webhook-signature.util';

describe('mercado-pago-webhook-signature.util', () => {
  it('parses ts and v1 from x-signature header', () => {
    expect(parseMercadoPagoSignatureHeader('ts=1742505638683,v1=abc123')).toEqual({
      ts: '1742505638683',
      v1: 'abc123',
    });
  });

  it('builds the manifest using only provided values', () => {
    expect(
      buildMercadoPagoWebhookManifest({
        dataId: '123456',
        requestId: 'bb56a2f1-6aae-46ac-982e-9dcd3581d08e',
        ts: '1742505638683',
      }),
    ).toBe('id:123456;request-id:bb56a2f1-6aae-46ac-982e-9dcd3581d08e;ts:1742505638683;');

    expect(
      buildMercadoPagoWebhookManifest({
        dataId: '123456',
        ts: '1742505638683',
      }),
    ).toBe('id:123456;ts:1742505638683;');
  });

  it('validates the signature with hmac sha256', () => {
    const secret = 'test-secret';
    const manifest = 'id:123456;request-id:bb56a2f1-6aae-46ac-982e-9dcd3581d08e;ts:1742505638683;';
    const v1 = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

    expect(
      verifyMercadoPagoWebhookSignature({
        secret,
        signature: `ts=1742505638683,v1=${v1}`,
        requestId: 'bb56a2f1-6aae-46ac-982e-9dcd3581d08e',
        dataId: '123456',
      }),
    ).toMatchObject({
      valid: true,
      reason: 'ok',
      manifest,
      receivedSignature: v1,
      expectedSignature: v1,
    });
  });

  it('rejects mismatched signatures', () => {
    expect(
      verifyMercadoPagoWebhookSignature({
        secret: 'test-secret',
        signature: 'ts=1742505638683,v1=deadbeef',
        requestId: 'bb56a2f1-6aae-46ac-982e-9dcd3581d08e',
        dataId: '123456',
      }),
    ).toMatchObject({
      valid: false,
      reason: 'signature_mismatch',
    });
  });
});
