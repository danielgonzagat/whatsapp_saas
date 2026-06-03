import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./core', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from './core';
import { sendReportEmail } from './reports';

const apiFetchMock = vi.mocked(apiFetch);

describe('reports API', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it('rejects report email API error envelopes instead of resolving as sent', async () => {
    apiFetchMock.mockResolvedValue({ error: 'SMTP provider offline', status: 503 });

    await expect(sendReportEmail({ email: 'ops@example.com' })).rejects.toThrow('SMTP provider offline');
  });

  it('returns confirmed report email responses unchanged', async () => {
    apiFetchMock.mockResolvedValue({ data: { success: true, message: 'sent' }, status: 200 });

    await expect(sendReportEmail({ email: 'ops@example.com' })).resolves.toEqual({
      data: { success: true, message: 'sent' },
      status: 200,
    });
  });
});
