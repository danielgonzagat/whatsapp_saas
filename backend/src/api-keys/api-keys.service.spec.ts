import { NotFoundException } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';

describe('ApiKeysService', () => {
  let prisma: any;
  let auditService: any;
  let service: ApiKeysService;

  beforeEach(() => {
    prisma = {
      apiKey: {
        findMany: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };
    service = new ApiKeysService(prisma, auditService);
  });

  it('lists API keys without exposing the persisted secret', async () => {
    prisma.apiKey.findMany.mockResolvedValue([
      {
        id: 'key-1',
        name: 'Primary',
        key: 'stored-secret',
        workspaceId: 'ws-1',
        createdAt: new Date('2026-04-18T10:00:00.000Z'),
        lastUsedAt: null,
      },
    ]);

    await expect(service.list('ws-1')).resolves.toEqual([
      {
        id: 'key-1',
        name: 'Primary',
        workspaceId: 'ws-1',
        createdAt: new Date('2026-04-18T10:00:00.000Z'),
        lastUsedAt: null,
        maskedKey: '****cret',
      },
    ]);
  });

  it('stores API keys hashed at rest and returns the raw key only once on create', async () => {
    prisma.apiKey.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'key-1',
      ...data,
      createdAt: new Date('2026-04-18T10:00:00.000Z'),
      lastUsedAt: null,
    }));

    const result = (await service.create('ws-1', 'Primary')) as any;

    expect(result.key).toMatch(/^sk_live_[a-f0-9]{48}$/);
    expect(result.maskedKey).toMatch(/^\*{4}[a-f0-9]{4}$/);
    const persistedKey = prisma.apiKey.create.mock.calls[0][0].data.key as string;
    expect(persistedKey).toMatch(/^[a-f0-9]{64}$/);
    expect(persistedKey).not.toBe(result.key);
  });

  it('validates hashed keys and keeps lastUsedAt tracking', async () => {
    prisma.apiKey.findUnique.mockResolvedValueOnce({
      id: 'key-1',
      key: 'stored-hash',
      workspaceId: 'ws-1',
      workspace: { id: 'ws-1' },
    });
    prisma.apiKey.update.mockResolvedValue(undefined);

    const result = await service.validateKey('kloel_live_0123456789abcdef0123456789abcdef0123456789abcdef');

    expect(result).toEqual({
      id: 'key-1',
      key: 'stored-hash',
      workspaceId: 'ws-1',
      workspace: { id: 'ws-1' },
    });
    expect(prisma.apiKey.update).toHaveBeenCalledWith({
      where: { id: 'key-1' },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  it('accepts legacy plaintext keys and migrates them to the hash form', async () => {
    prisma.apiKey.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'legacy-key',
        key: 'kloel_live_legacy_plaintext_key',
        workspaceId: 'ws-1',
        workspace: { id: 'ws-1' },
      });
    prisma.apiKey.update.mockResolvedValue(undefined);

    const result = await service.validateKey('kloel_live_legacy_plaintext_key');

    expect(result?.id).toBe('legacy-key');
    expect(prisma.apiKey.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: 'legacy-key' },
        data: expect.objectContaining({
          key: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      }),
    );
  });

  it('rejects delete for keys outside the workspace', async () => {
    prisma.apiKey.findUnique.mockResolvedValue({
      id: 'key-1',
      workspaceId: 'other-workspace',
      name: 'Primary',
    });

    await expect(service.delete('ws-1', 'key-1')).rejects.toThrow(NotFoundException);
  });
});
