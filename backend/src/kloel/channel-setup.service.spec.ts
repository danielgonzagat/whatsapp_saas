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
  it('uploads arsenal files through storage and persists the returned storage path', async () => {
    const prisma = buildPrisma();
    const storage = {
      upload: jest.fn().mockResolvedValue({
        path: 'r2://channel-arsenal/ws-1/instagram/audio.mp3',
        size: 12,
        url: 'https://cdn.kloel.test/audio.mp3',
      }),
    };
    const service = new ChannelSetupService(prisma as never, storage as never);

    const mp3Buffer = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00]);

    await service.addArsenalUpload(
      'ws-1',
      'instagram',
      { label: 'Audio aprovado', type: 'audio' },
      {
        buffer: mp3Buffer,
        mimetype: 'audio/mpeg',
        originalname: 'audio.mp3',
        size: 12,
      },
    );

    expect(storage.upload).toHaveBeenCalledWith(
      mp3Buffer,
      expect.objectContaining({
        folder: 'channel-arsenal/ws-1/instagram',
        mimeType: 'audio/mpeg',
        workspaceId: 'ws-1',
      }),
    );
    const upsert = prisma.channelArsenal.upsert.mock.calls[0]?.[0] as {
      create: { metadata: unknown; storageRef: string };
    };
    expect(upsert.create.storageRef).toBe('r2://channel-arsenal/ws-1/instagram/audio.mp3');
    expect(upsert.create.metadata).toEqual(
      expect.objectContaining({
        originalName: 'audio.mp3',
        publicUrl: 'https://cdn.kloel.test/audio.mp3',
        size: 12,
      }),
    );
  });

  it('rejects arsenal uploads whose signature does not match the selected type', async () => {
    const prisma = buildPrisma();
    const storage = { upload: jest.fn() };
    const service = new ChannelSetupService(prisma as never, storage as never);

    await expect(
      service.addArsenalUpload(
        'ws-1',
        'instagram',
        { label: 'Imagem falsa', type: 'image' },
        {
          buffer: Buffer.from('not-an-image'),
          mimetype: 'image/png',
          originalname: 'asset.png',
          size: 12,
        },
      ),
    ).rejects.toThrow('assinatura_do_arquivo_invalida');
    expect(storage.upload).not.toHaveBeenCalled();
    expect(prisma.channelArsenal.upsert).not.toHaveBeenCalled();
  });

  it('uses one generated asset id for both upsert lookup and create payload', async () => {
    const prisma = buildPrisma();
    const storage = { upload: jest.fn() };
    const service = new ChannelSetupService(prisma as never, storage as never);

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

  it('rejects products from another workspace before replacing channel products', async () => {
    const prisma = buildPrisma({
      product: {
        count: jest.fn(async () => 1),
        findMany: jest.fn(async () => []),
      },
    });
    const service = new ChannelSetupService(prisma as never, { upload: jest.fn() } as never);

    await expect(
      service.saveProducts('ws-1', 'whatsapp', { productIds: ['prod-1', 'prod-2'] }),
    ).rejects.toThrow('produto_do_canal_nao_encontrado');
    expect(prisma.channelProduct.deleteMany).not.toHaveBeenCalled();
  });

  it('requires config before marking a channel setup as complete', async () => {
    const prisma = buildPrisma({
      channelConfig: {
        findUnique: jest.fn(async () => null),
      },
    });
    const service = new ChannelSetupService(prisma as never, { upload: jest.fn() } as never);

    await expect(service.complete('ws-1', 'email')).rejects.toThrow(
      'configuracao_do_canal_obrigatoria',
    );
    expect(prisma.channelSetup.upsert).not.toHaveBeenCalled();
  });
});
