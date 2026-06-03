import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listDocuments, uploadDocument } from './documents';

vi.mock('../http', () => ({
  API_BASE: 'https://api.kloel.test',
}));

vi.mock('./core', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from './core';

const apiFetchMock = vi.mocked(apiFetch);
const fetchMock = vi.fn();

describe('documents API truthfulness', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('normalizes real backend document list payloads', async () => {
    apiFetchMock.mockResolvedValueOnce({
      data: {
        documents: [
          {
            id: 'doc-1',
            name: 'Contrato',
            url: 'https://api.kloel.test/media/documents/doc-1/file',
            mimeType: 'application/pdf',
            fileSize: 1234,
            createdAt: '2026-06-01T00:00:00.000Z',
          },
        ],
      },
      status: 200,
    });

    await expect(listDocuments('workspace-1')).resolves.toEqual([
      {
        id: 'doc-1',
        name: 'Contrato',
        url: 'https://api.kloel.test/media/documents/doc-1/file',
        type: 'application/pdf',
        size: 1234,
        createdAt: '2026-06-01T00:00:00.000Z',
      },
    ]);
  });

  it('rejects document list API errors instead of returning a fake empty list', async () => {
    apiFetchMock.mockResolvedValueOnce({ error: 'Document storage offline', status: 503 });

    await expect(listDocuments('workspace-1')).rejects.toThrow('Document storage offline');
  });

  it('rejects document list responses without confirmed payload', async () => {
    apiFetchMock.mockResolvedValueOnce({ data: undefined, status: 200 });

    await expect(listDocuments('workspace-1')).rejects.toThrow(
      'Document list did not return a confirmed payload',
    );
  });

  it('normalizes real backend upload wrapper payloads', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        document: {
          id: 'doc-1',
          name: 'Contrato',
          url: 'https://api.kloel.test/media/documents/doc-1/file',
          mimeType: 'application/pdf',
          fileSize: 1234,
          createdAt: '2026-06-01T00:00:00.000Z',
        },
      }),
    });

    const result = await uploadDocument(
      'workspace-1',
      new File(['pdf'], 'contrato.pdf', { type: 'application/pdf' }),
      'contract',
      'token-1',
    );

    expect(result).toEqual({
      id: 'doc-1',
      name: 'Contrato',
      url: 'https://api.kloel.test/media/documents/doc-1/file',
      type: 'application/pdf',
      size: 1234,
      createdAt: '2026-06-01T00:00:00.000Z',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.kloel.test/media/documents/upload',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer token-1' },
      }),
    );
  });

  it('rejects successful upload responses without a confirmed document', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    });

    await expect(
      uploadDocument('workspace-1', new File(['pdf'], 'contrato.pdf'), 'contract'),
    ).rejects.toThrow('Document upload did not return a confirmed document');
  });

  it('surfaces backend upload errors', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockResolvedValue({ message: 'Tipo de arquivo nao permitido' }),
    });

    await expect(
      uploadDocument('workspace-1', new File(['exe'], 'virus.exe'), 'other'),
    ).rejects.toThrow('Tipo de arquivo nao permitido');
  });
});
