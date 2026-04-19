import { describe, expect, it } from 'vitest';

import { GET } from './route';

describe('GET /api/whatsapp-api/session/qr', () => {
  it('returns 410 Gone because QR onboarding was deprecated', async () => {
    const response = await GET();
    const body = (await response.json()) as {
      statusCode: number;
      success: boolean;
      message: string;
      feature: string;
      reason: string;
    };

    expect(response.status).toBe(410);
    expect(body.statusCode).toBe(410);
    expect(body.success).toBe(false);
    expect(body.feature).toBe('qr_code');
    expect(body.reason).toBe('qr_code_not_supported_for_meta_cloud');
    expect(body.message).toContain('Descontinuado');
  });
});
