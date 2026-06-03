import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./core', () => ({
  apiFetch: vi.fn(),
  tokenStorage: {
    getWorkspaceId: vi.fn(),
  },
}));

import { apiFetch, tokenStorage } from './core';
import { listAITools } from './agent-tools';

const apiFetchMock = vi.mocked(apiFetch);
const getWorkspaceIdMock = vi.mocked(tokenStorage.getWorkspaceId);

describe('listAITools', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    getWorkspaceIdMock.mockReset();
    getWorkspaceIdMock.mockReturnValue('workspace-1');
  });

  it('loads and normalizes tools from the backend tools envelope', async () => {
    apiFetchMock.mockResolvedValue({
      data: {
        workspaceId: 'workspace-1',
        tools: [
          {
            name: 'send_message',
            description: 'Envia mensagem',
            category: 'communication',
          },
        ],
      },
      status: 200,
    });

    await expect(listAITools()).resolves.toEqual([
      {
        name: 'send_message',
        description: 'Envia mensagem',
        category: 'communication',
        enabled: true,
      },
    ]);
    expect(apiFetchMock).toHaveBeenCalledWith('/kloel/agent/workspace-1/tools');
  });

  it('honors explicit enabled state from the backend', async () => {
    apiFetchMock.mockResolvedValue({
      data: [
        {
          name: 'create_payment_link',
          description: 'Cria link de pagamento',
          category: 'sales',
          enabled: false,
        },
      ],
      status: 200,
    });

    await expect(listAITools('token', 'workspace-2')).resolves.toEqual([
      {
        name: 'create_payment_link',
        description: 'Cria link de pagamento',
        category: 'sales',
        enabled: false,
      },
    ]);
    expect(apiFetchMock).toHaveBeenCalledWith('/kloel/agent/workspace-2/tools');
  });

  it('rejects backend errors instead of returning hardcoded disabled tools', async () => {
    apiFetchMock.mockResolvedValue({ error: 'agent offline', status: 503 });

    await expect(listAITools()).rejects.toThrow('agent offline');
  });

  it('rejects missing tools payloads instead of returning a fake empty list', async () => {
    apiFetchMock.mockResolvedValue({ data: undefined, status: 200 });

    await expect(listAITools()).rejects.toThrow('AI tools did not return a confirmed payload');
  });

  it('rejects malformed tool entries', async () => {
    apiFetchMock.mockResolvedValue({
      data: { workspaceId: 'workspace-1', tools: [{ name: 'broken' }] },
      status: 200,
    });

    await expect(listAITools()).rejects.toThrow('AI tools did not return a confirmed payload');
  });

  it('requires a workspace id', async () => {
    getWorkspaceIdMock.mockReturnValue(null);

    await expect(listAITools()).rejects.toThrow('Workspace id is required to list AI tools');
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});
