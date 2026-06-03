import { afterEach, describe, expect, it, vi } from 'vitest';

const { tokenStorageMock, mutateMock } = vi.hoisted(() => ({
  tokenStorageMock: {
    getToken: vi.fn(() => 'token-1'),
    getWorkspaceId: vi.fn(() => 'workspace-1'),
  },
  mutateMock: vi.fn(),
}));

vi.mock('swr', () => ({
  mutate: mutateMock,
}));

vi.mock('../http', () => ({
  API_BASE: 'https://api.kloel.test',
}));

vi.mock('./core', () => ({
  apiFetch: vi.fn(),
  tokenStorage: tokenStorageMock,
}));

import { apiFetch } from './core';
import { listPendingKloelApprovals, uploadChatFile } from './kloel';

const apiFetchMock = vi.mocked(apiFetch);

function buildFile() {
  return new File(['catalogo'], 'catalogo.pdf', { type: 'application/pdf' });
}

describe('uploadChatFile', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    tokenStorageMock.getToken.mockClear();
    tokenStorageMock.getWorkspaceId.mockClear();
  });

  it('uploads through the authenticated chat upload endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          url: 'https://cdn.kloel.test/chat/catalogo.pdf',
          type: 'document',
          name: 'catalogo.pdf',
          size: 8,
          mimeType: 'application/pdf',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadChatFile(buildFile())).resolves.toEqual({
      success: true,
      url: 'https://cdn.kloel.test/chat/catalogo.pdf',
      type: 'document',
      name: 'catalogo.pdf',
      size: 8,
      mimeType: 'application/pdf',
    });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit & {
      headers?: Record<string, string>;
    };
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.kloel.test/kloel/upload-chat');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.headers?.Authorization).toBe('Bearer token-1');
    expect(init.headers?.['x-workspace-id']).toBe('workspace-1');
  });

  it('rejects backend success false instead of marking an attachment as ready', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'Tipo de arquivo não permitido' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadChatFile(buildFile())).rejects.toThrow('Tipo de arquivo não permitido');
  });
});


describe('listPendingKloelApprovals', () => {
  afterEach(() => {
    apiFetchMock.mockReset();
  });

  it('returns confirmed pending approval requests from the backend', async () => {
    const approval = {
      id: 'approval-1',
      kind: 'tool_call',
      scope: 'workspace',
      entityType: 'product',
      entityId: 'prod-1',
      state: 'pending',
      title: 'Aprovar ação real',
      prompt: 'Criar campanha para produto real',
      payload: { productId: 'prod-1' },
      createdAt: '2026-06-01T13:00:00.000Z',
      updatedAt: '2026-06-01T13:00:00.000Z',
    };
    apiFetchMock.mockResolvedValueOnce({ data: { approvals: [approval] }, status: 200 });

    await expect(listPendingKloelApprovals()).resolves.toEqual([approval]);
    expect(apiFetchMock).toHaveBeenCalledWith('/kloel/approvals/pending');
  });

  it('rejects malformed approval lists instead of hiding pending actions as empty', async () => {
    apiFetchMock.mockResolvedValueOnce({ data: { approvals: { id: 'approval-1' } }, status: 200 });

    await expect(listPendingKloelApprovals()).rejects.toThrow('Invalid Kloel approvals payload');
  });
});
