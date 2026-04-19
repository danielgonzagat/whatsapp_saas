import { describe, expect, it } from 'vitest';

import { createLegacyWhatsAppGoneResponse } from './legacy-runtime';

describe('createLegacyWhatsAppGoneResponse', () => {
  it('returns 410 Gone with a migration message', async () => {
    const response = createLegacyWhatsAppGoneResponse('qr_code');
    const body = (await response.json()) as {
      statusCode: number;
      success: boolean;
      message: string;
      feature: string;
      provider: string;
      notSupported: boolean;
      reason: string;
    };

    expect(response.status).toBe(410);
    expect(body).toMatchObject({
      statusCode: 410,
      success: false,
      feature: 'qr_code',
      provider: 'meta-cloud',
      notSupported: true,
      reason: 'qr_code_not_supported_for_meta_cloud',
    });
    expect(body.message).toContain('Descontinuado');
    expect(body.message).toContain('integração Meta');
  });
});
