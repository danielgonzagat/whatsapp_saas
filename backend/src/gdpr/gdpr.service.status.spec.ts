import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { GdprStatus, GdprType } from '@prisma/client';
import { EmailService } from '../auth/email.service';
import { StorageService } from '../common/storage/storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { GdprService } from './gdpr.service';
import { createPartialPrismaMock } from '../../test/helpers/prisma.mock';

jest.mock('../common/redis/redis.util', () => ({
  createRedisClient: jest.fn(() => {
    const { RedisConfigurationError } = jest.requireActual<
      typeof import('../common/redis/resolve-redis-url')
    >('../common/redis/resolve-redis-url');
    throw new RedisConfigurationError('Redis not available in test');
  }),
}));

describe('GdprService getStatus', () => {
  let service: GdprService;
  const requestedAt = new Date('2026-05-10T12:00:00.000Z');
  let prismaMock: ReturnType<typeof createPartialPrismaMock>;

  beforeEach(async () => {
    prismaMock = createPartialPrismaMock({
      gdprRequest: ['findFirst'],
    });
    prismaMock.gdprRequest.findFirst.mockResolvedValue({
      id: 'gdpr_1',
      workspaceId: 'ws_1',
      userId: 'agent_1',
      type: GdprType.EXPORT,
      code: 'abc123',
      status: GdprStatus.PENDING,
      requestedAt,
      completedAt: null,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GdprService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: {} },
        { provide: StorageService, useValue: {} },
        { provide: EmailService, useValue: {} },
      ],
    }).compile();

    service = module.get<GdprService>(GdprService);
  });

  it('returns status for a valid code', async () => {
    const result = await service.getStatus('abc123');

    expect(result).toEqual(
      expect.objectContaining({
        code: 'abc123',
        type: GdprType.EXPORT,
        status: GdprStatus.PENDING,
      }),
    );
  });

  it('throws NotFoundException for unknown code', async () => {
    prismaMock.gdprRequest.findFirst.mockResolvedValueOnce(null);

    await expect(service.getStatus('unknown')).rejects.toThrow('Solicitação não encontrada.');
  });
});
