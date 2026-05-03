import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

type MockedApiKeyRecord = {
  id: string;
  name: string;
  key: string;
  workspaceId: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  workspace?: { id: string; name: string };
};

type MockedApiKeyDelegate = {
  findMany: jest.Mock;
  create: jest.Mock;
  findFirst: jest.Mock;
  deleteMany: jest.Mock;
  update: jest.Mock;
};

type MockedLogFn = jest.Mock<(args: Record<string, unknown>) => Promise<void>>;

describe('ApiKeysService', () => {
  let service: ApiKeysService;

  const mockAuditLog = {
    create: jest.fn().mockResolvedValue({} as never),
  };

  const mockApiKey: MockedApiKeyDelegate = {
    findMany: jest.fn(),
    create: jest.fn(),
    findFirst: jest.fn(),
    deleteMany: jest.fn(),
    update: jest.fn(),
  };

  const mockPrisma = {
    apiKey: mockApiKey,
    auditLog: mockAuditLog,
  } as unknown as PrismaService;

  const mockAuditService = {
    log: jest.fn().mockResolvedValue(undefined as never) as MockedLogFn,
  } as unknown as AuditService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeysService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
      ],
    }).compile();

    service = module.get<ApiKeysService>(ApiKeysService);
  });

  describe('list', () => {
    it('retorna chaves do workspace ordenadas por createdAt desc', async () => {
      const keys: MockedApiKeyRecord[] = [
        {
          id: 'k2',
          name: 'Staging',
          createdAt: new Date('2026-02-01'),
          lastUsedAt: null,
          workspaceId: 'ws-1',
          key: 'hash2',
        },
        {
          id: 'k1',
          name: 'Production',
          createdAt: new Date('2026-01-01'),
          lastUsedAt: new Date('2026-04-01'),
          workspaceId: 'ws-1',
          key: 'hash1',
        },
      ];
      mockApiKey.findMany.mockResolvedValue(keys);

      const result = await service.list('ws-1');

      expect(result).toEqual(keys);
      expect(mockApiKey.findMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1' },
        select: {
          id: true,
          name: true,
          createdAt: true,
          lastUsedAt: true,
          workspaceId: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    });

    it('retorna array vazio quando workspace não tem chaves', async () => {
      mockApiKey.findMany.mockResolvedValue([]);

      const result = await service.list('ws-empty');

      expect(result).toEqual([]);
    });
  });

  describe('create', () => {
    it('cria api key, armazena hash e retorna raw key', async () => {
      const createdRecord: MockedApiKeyRecord = {
        id: 'ak-1',
        workspaceId: 'ws-1',
        name: 'Production Key',
        key: 'SHA256_HASH_VALUE',
        createdAt: new Date(),
        lastUsedAt: null,
      };
      mockApiKey.create.mockResolvedValue(createdRecord);

      const result = await service.create('ws-1', 'Production Key');

      // Returns record with raw key (not hash)
      expect(result.key).toMatch(/^sk_live_[a-f0-9]{48}$/);
      expect(result.id).toBe('ak-1');
      expect(result.name).toBe('Production Key');

      // Stored key is a SHA-256 hash
      const callArgs = mockApiKey.create.mock.calls[0][0] as { data: { key: string } };
      const storedKey = callArgs.data.key;
      expect(storedKey).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex = 64 chars
    });

    it('cada chamada gera uma key diferente', async () => {
      const storedHashes: string[] = [];
      const rawKeys: string[] = [];
      mockApiKey.create.mockImplementation((args: { data: Record<string, unknown> }) => {
        storedHashes.push(args.data.key as string);
        const entry = { id: `ak-${storedHashes.length}`, ...args.data };
        return Promise.resolve(entry);
      });

      const result1 = await service.create('ws-1', 'Key A');
      const result2 = await service.create('ws-1', 'Key B');

      rawKeys.push(result1.key, result2.key);
      expect(rawKeys[0]).not.toBe(rawKeys[1]);
      expect(rawKeys[0]).toMatch(/^sk_live_[a-f0-9]{48}$/);
      expect(rawKeys[1]).toMatch(/^sk_live_[a-f0-9]{48}$/);

      // Stored hashes differ from raw keys
      expect(storedHashes[0]).not.toBe(rawKeys[0]);
      expect(storedHashes[1]).not.toBe(rawKeys[1]);

      // Hashes match their respective raw keys
      const expectedHash0 = createHash('sha256').update(rawKeys[0]).digest('hex');
      const expectedHash1 = createHash('sha256').update(rawKeys[1]).digest('hex');
      expect(storedHashes[0]).toBe(expectedHash0);
      expect(storedHashes[1]).toBe(expectedHash1);
    });
  });

  describe('rotate', () => {
    it('rotaciona key gerando novo raw, armazenando new hash', async () => {
      const existing: MockedApiKeyRecord = {
        id: 'ak-1',
        name: 'Old Key',
        workspaceId: 'ws-1',
        key: 'old_hash',
        createdAt: new Date(),
        lastUsedAt: null,
      };
      mockApiKey.findFirst.mockResolvedValue(existing);
      mockApiKey.update.mockResolvedValue({ ...existing, key: 'new_hash' });

      const result = await service.rotate('ws-1', 'ak-1');

      expect(result.key).toMatch(/^sk_live_[a-f0-9]{48}$/);
      expect(result.id).toBe('ak-1');
      expect(result.name).toBe('Old Key');

      const callArgs = mockApiKey.update.mock.calls[0][0] as { data: { key: string } };
      const storedKey = callArgs.data.key;
      expect(storedKey).toMatch(/^[a-f0-9]{64}$/);
      expect(storedKey).not.toBe('old_hash');

      expect(mockAuditService.log).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        action: 'UPDATE_RECORD',
        resource: 'ApiKey',
        resourceId: 'ak-1',
        details: { action: 'rotate', name: 'Old Key' },
      });
    });

    it('lança NotFoundException se key não existe', async () => {
      mockApiKey.findFirst.mockResolvedValue(null);

      await expect(service.rotate('ws-1', 'ak-nonexistent')).rejects.toThrow(NotFoundException);
      expect(mockApiKey.update).not.toHaveBeenCalled();
      expect(mockAuditService.log).not.toHaveBeenCalled();
    });

    it('lança NotFoundException se key pertence a outro workspace', async () => {
      mockApiKey.findFirst.mockResolvedValue(null);

      await expect(service.rotate('ws-2', 'ak-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('deleta chave e registra auditoria', async () => {
      const keyRecord: MockedApiKeyRecord = {
        id: 'ak-1',
        name: 'Old Key',
        workspaceId: 'ws-1',
        key: 'hash',
        createdAt: new Date(),
        lastUsedAt: null,
      };
      mockApiKey.findFirst.mockResolvedValue(keyRecord);
      mockApiKey.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.delete('ws-1', 'ak-1');

      expect(result).toEqual({ count: 1 });
      expect(mockApiKey.findFirst).toHaveBeenCalledWith({
        where: { id: 'ak-1', workspaceId: 'ws-1' },
      });
      expect(mockAuditService.log).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        action: 'DELETE_RECORD',
        resource: 'ApiKey',
        resourceId: 'ak-1',
        details: { deletedBy: 'user', name: 'Old Key' },
      });
      expect(mockApiKey.deleteMany).toHaveBeenCalledWith({
        where: { id: 'ak-1', workspaceId: 'ws-1' },
      });
    });

    it('lança NotFoundException se chave não existe', async () => {
      mockApiKey.findFirst.mockResolvedValue(null);

      await expect(service.delete('ws-1', 'ak-nonexistent')).rejects.toThrow(NotFoundException);
      expect(mockApiKey.deleteMany).not.toHaveBeenCalled();
      expect(mockAuditService.log).not.toHaveBeenCalled();
    });

    it('lança NotFoundException se chave existe mas pertence a outro workspace', async () => {
      mockApiKey.findFirst.mockResolvedValue(null);

      await expect(service.delete('ws-2', 'ak-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('validateKey', () => {
    it('faz lookup por hash da key e retorna apiKey com workspace', async () => {
      const rawKey = 'sk_live_' + 'valid_key_for_test';
      const keyHash = createHash('sha256').update(rawKey).digest('hex');
      const apiKeyRecord: MockedApiKeyRecord = {
        id: 'ak-1',
        key: keyHash,
        workspaceId: 'ws-1',
        workspace: { id: 'ws-1', name: 'Test Corp' },
        name: 'Key',
        createdAt: new Date(),
        lastUsedAt: null,
      };
      mockApiKey.findFirst.mockResolvedValue(apiKeyRecord);
      mockApiKey.update.mockResolvedValue({});

      const result = await service.validateKey(rawKey);

      expect(result).toEqual(apiKeyRecord);
      expect(mockApiKey.findFirst).toHaveBeenCalledWith({
        where: { key: keyHash, workspaceId: { not: '' } },
        include: { workspace: true },
      });
    });

    it('retorna null quando key não existe', async () => {
      mockApiKey.findFirst.mockResolvedValue(null);

      const result = await service.validateKey('sk_live_invalid');

      expect(result).toBeNull();
      expect(mockApiKey.update).not.toHaveBeenCalled();
    });

    it('atualiza lastUsedAt de forma assincrona (fire and forget)', async () => {
      const rawKey = 'sk_live_' + 'valid';
      const keyHash = createHash('sha256').update(rawKey).digest('hex');
      const apiKeyRecord: MockedApiKeyRecord = {
        id: 'ak-1',
        key: keyHash,
        workspaceId: 'ws-1',
        workspace: { id: 'ws-1', name: 'Test Corp' },
        name: 'Key',
        createdAt: new Date(),
        lastUsedAt: null,
      };
      mockApiKey.findFirst.mockResolvedValue(apiKeyRecord);
      mockApiKey.update.mockResolvedValue({});

      const result = await service.validateKey(rawKey);

      expect(result).toEqual(apiKeyRecord);
      const callArg = mockApiKey.update.mock.calls[0][0] as { data: { lastUsedAt: Date } };
      expect(callArg.data.lastUsedAt).toBeInstanceOf(Date);
      expect(callArg.where).toEqual({ id: 'ak-1' });
    });

    it('não lança exceção se update de lastUsedAt falhar', async () => {
      const rawKey = 'sk_live_' + 'valid';
      const keyHash = createHash('sha256').update(rawKey).digest('hex');
      const apiKeyRecord: MockedApiKeyRecord = {
        id: 'ak-1',
        key: keyHash,
        workspaceId: 'ws-1',
        workspace: { id: 'ws-1', name: 'Test Corp' },
        name: 'Key',
        createdAt: new Date(),
        lastUsedAt: null,
      };
      mockApiKey.findFirst.mockResolvedValue(apiKeyRecord);
      mockApiKey.update.mockRejectedValue(new Error('DB timeout'));

      const result = await service.validateKey(rawKey);

      expect(result).toEqual(apiKeyRecord);
    });
  });
});
