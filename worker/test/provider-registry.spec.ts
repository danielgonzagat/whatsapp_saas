import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFindFirst, mockFindUnique } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockFindUnique: vi.fn(),
}));

vi.mock('../db', () => ({
  prisma: {
    contact: {
      findFirst: mockFindFirst,
      findUnique: mockFindUnique,
    },
  },
}));

vi.mock('../providers/auto-provider', () => ({
  autoProvider: {
    name: 'auto',
    sendText: vi.fn(),
    sendMedia: vi.fn(),
  },
}));

vi.mock('../providers/email-provider', () => ({
  emailProvider: {
    name: 'email',
    sendText: vi.fn(),
    sendMedia: vi.fn(),
  },
}));

describe('ProviderRegistry', () => {
  const originalEnv = process.env.WHATSAPP_PROVIDER_DEFAULT;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WHATSAPP_PROVIDER_DEFAULT = 'meta-cloud';
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.WHATSAPP_PROVIDER_DEFAULT;
    } else {
      process.env.WHATSAPP_PROVIDER_DEFAULT = originalEnv;
    }
  });

  it('preserves a persisted workspace provider override for WhatsApp contacts', async () => {
    mockFindUnique.mockResolvedValue({
      phone: '5511999999999',
      workspace: {
        id: 'ws-1',
        jitterMin: 5,
        jitterMax: 15,
        providerSettings: {
          whatsappProvider: 'whatsapp-api',
        },
      },
    });

    const { ProviderRegistry } = await import('../providers/registry');
    const provider = await ProviderRegistry.getProviderForUser('5511999999999', 'ws-1');

    expect(provider.workspace).toEqual(
      expect.objectContaining({
        id: 'ws-1',
        whatsappProvider: 'whatsapp-api',
        jitterMin: 5,
        jitterMax: 15,
      }),
    );
  });
});
