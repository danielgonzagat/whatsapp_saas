import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockContactFindUnique, mockContactFindFirst, mockAutoProvider } = vi.hoisted(() => ({
  mockContactFindUnique: vi.fn(),
  mockContactFindFirst: vi.fn(),
  mockAutoProvider: {
    name: 'auto',
    sendText: vi.fn(),
  },
}));

vi.mock('../db', () => ({
  prisma: {
    contact: {
      findUnique: mockContactFindUnique,
      findFirst: mockContactFindFirst,
    },
  },
}));

vi.mock('./auto-provider', () => ({
  autoProvider: mockAutoProvider,
}));

vi.mock('./email-provider', () => ({
  emailProvider: { name: 'email', sendText: vi.fn() },
}));

vi.mock('./whatsapp-provider-resolver', () => ({
  getWhatsAppProviderFromEnv: vi.fn(() => 'WAHA'),
}));

describe('ProviderRegistry tenant filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not query contact without workspaceId for phone lookups', async () => {
    const { ProviderRegistry } = await import('../providers/registry');

    const result = await ProviderRegistry.getProviderForUser('+5511999999999', undefined);

    expect(result).toBeDefined();
    expect(mockContactFindFirst).not.toHaveBeenCalled();
    expect(mockContactFindUnique).not.toHaveBeenCalled();
  });

  it('uses findUnique with workspaceId_phone compound key when workspaceId is provided', async () => {
    mockContactFindUnique.mockResolvedValueOnce(null);
    const { ProviderRegistry } = await import('../providers/registry');

    const result = await ProviderRegistry.getProviderForUser('+5511999999999', 'ws_1');

    expect(mockContactFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId_phone: expect.objectContaining({
            workspaceId: 'ws_1',
          }),
        }),
      }),
    );
    expect(result).toBeDefined();
  });

  it('resolves contact workspace when found', async () => {
    mockContactFindUnique.mockResolvedValueOnce({
      workspace: { id: 'ws_found', jitterMin: 100, jitterMax: 1000 },
    });
    const { ProviderRegistry } = await import('../providers/registry');

    const result = await ProviderRegistry.getProviderForUser('+5511999999999', 'ws_1');

    expect(result.workspace).toEqual(expect.objectContaining({ id: 'ws_found' }));
  });

  it('returns default workspace when contact not found', async () => {
    mockContactFindUnique.mockResolvedValueOnce(null);
    const { ProviderRegistry } = await import('../providers/registry');

    const result = await ProviderRegistry.getProviderForUser('+5511999999999', 'ws_1');

    expect(result.workspace).toEqual(expect.objectContaining({ id: 'ws_1' }));
  });
});
