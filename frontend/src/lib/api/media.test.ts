import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./core', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from './core';
import { mediaApi, videoApi, voiceApi } from './media';

const apiFetchMock = vi.mocked(apiFetch);

describe('media API mutation truthfulness', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it('rejects video creation API error envelopes', async () => {
    apiFetchMock.mockResolvedValue({ error: 'Video worker offline', status: 503 });

    await expect(videoApi.create('https://cdn.kloel.com/in.mp4', 'Corte')).rejects.toThrow(
      'Video worker offline',
    );
  });

  it('rejects video creation responses without a confirmed job id', async () => {
    apiFetchMock.mockResolvedValue({ data: { status: 'PENDING' }, status: 200 });

    await expect(videoApi.create('https://cdn.kloel.com/in.mp4', 'Corte')).rejects.toThrow(
      'Video job nao foi confirmado.',
    );
  });

  it('rejects voice generation responses without an audio URL', async () => {
    apiFetchMock.mockResolvedValue({ data: { duration: 3 }, status: 200 });

    await expect(voiceApi.generate({ text: 'Oi' })).rejects.toThrow('Audio gerado sem URL confirmado.');
  });

  it('returns confirmed media processing jobs unchanged', async () => {
    apiFetchMock.mockResolvedValue({ data: { id: 'job-1', status: 'PENDING' }, status: 201 });

    await expect(mediaApi.processVideo({ prompt: 'Criar corte' })).resolves.toEqual({
      data: { id: 'job-1', status: 'PENDING' },
      status: 201,
    });
  });
});
