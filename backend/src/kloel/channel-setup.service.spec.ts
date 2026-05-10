import { ChannelSetupService, normalizeSetupChannel } from './channel-setup.service';

function buildPrisma(overrides: Record<string, unknown> = {}) {
  return {
    channelSetup: {
      findUnique: jest.fn(),
      upsert: jest.fn(() => ({ query: 'setup' })),
    },
    channelConfig: {
      findUnique: jest.fn(),
    },
    product: {
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
    },
    channelProduct: {
      findMany: jest.fn(async () => []),
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
    channelArsenal: {
      findMany: jest.fn(async () => []),
      upsert: jest.fn((query: unknown) => ({ query: 'arsenal', input: query })),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(async (queries: unknown[]) => queries),
    ...overrides,
  };
}

describe('ChannelSetupService', () => {
  it('uses one generated asset id for both upsert lookup and create payload', async () => {
    const prisma = buildPrisma();
    const service = new ChannelSetupService(prisma as never);

    await service.addArsenal('ws-1', 'instagram', {
      type: 'audio',
      label: 'Boas-vindas',
      storageRef: 'r2://arsenal/audio-1.mp3',
    });

    const upsertCall = prisma.channelArsenal.upsert.mock.calls[0];
    expect(upsertCall).toBeDefined();
    const upsert = upsertCall?.[0] as {
      where: { workspaceId_channel_assetId: { assetId: string } };
      create: { assetId: string; channel: string };
    };
    const lookupAssetId = upsert.where.workspaceId_channel_assetId.assetId;
    const createAssetId = upsert.create.assetId;

    expect(lookupAssetId).toBe(createAssetId);
    expect(typeof createAssetId).toBe('string');
    expect(createAssetId.length).toBeGreaterThan(0);
    expect(upsert.create.channel).toBe('instagram');
    expect(prisma.$transaction).toHaveBeenCalledWith([
      { query: 'arsenal', input: upsert },
      { query: 'setup' },
    ]);
  });

  it('normalizes messenger setup to the facebook channel storage key', () => {
    expect(normalizeSetupChannel('messenger')).toBe('facebook');
  });
});
