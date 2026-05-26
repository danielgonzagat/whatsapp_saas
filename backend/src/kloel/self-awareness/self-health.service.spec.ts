import { Test, TestingModule } from '@nestjs/testing';
import { SelfHealthService } from './self-health.service';
import { PrismaService } from '../../prisma/prisma.service';

const REDIS_TOKEN = 'default_IORedisModuleConnectionToken';
describe('SelfHealthService', () => {
  let service: SelfHealthService;
  let prisma: { $queryRaw: jest.Mock; workspace: { findUnique: jest.Mock }; auditLog: { findFirst: jest.Mock } };
  let redis: { ping: jest.Mock };
  beforeEach(async () => {
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ providerSettings: {} }),
      },
      auditLog: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    redis = {
      ping: jest.fn().mockResolvedValue('PONG'),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SelfHealthService,
        { provide: PrismaService, useValue: prisma },
        { provide: REDIS_TOKEN, useValue: redis },
      ],
    }).compile();
    service = module.get<SelfHealthService>(SelfHealthService);
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
  it('returns ok for all probes when infra is healthy', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      providerSettings: { whatsapp: { phoneNumberId: '123', connected: true } },
    });
    prisma.auditLog.findFirst.mockResolvedValue({
      id: 'al-1',
      details: {},
      createdAt: new Date(),
    });

    const snapshot = await service.snapshot('ws-1');

    expect(snapshot.db).toBe('ok');
    expect(snapshot.redis).toBe('ok');
    expect(snapshot.whatsapp).toBe('connected');
    expect(snapshot.llm).toBe('ok');
    expect(snapshot.lastChecked).toBeDefined();
  });
  it('returns down when db probe fails', async () => {
    prisma.$queryRaw.mockRejectedValueOnce(new Error('connection refused'));

    const snapshot = await service.snapshot('ws-1');

    expect(snapshot.db).toBe('down');
    expect(snapshot.redis).toBe('ok');
  });
  it('returns down when redis probe fails', async () => {
    redis.ping.mockRejectedValueOnce(new Error('connection refused'));

    const snapshot = await service.snapshot('ws-1');

    expect(snapshot.redis).toBe('down');
    expect(snapshot.db).toBe('ok');
  });
  it('returns unknown for whatsapp when no settings', async () => {
    const snapshot = await service.snapshot('ws-1');

    expect(snapshot.whatsapp).toBe('unknown');
  });
  it('returns disconnected for whatsapp when settings present but not connected', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      providerSettings: { whatsapp: {} },
    });

    const snapshot = await service.snapshot('ws-1');

    expect(snapshot.whatsapp).toBe('disconnected');
  });
  it('returns unknown for llm when no recent calls', async () => {
    const snapshot = await service.snapshot('ws-1');

    expect(snapshot.llm).toBe('unknown');
  });
  it('returns degraded for llm when recent call has error', async () => {
    prisma.auditLog.findFirst.mockResolvedValue({
      id: 'al-1',
      details: { error: 'timeout' },
      createdAt: new Date(),
    });

    const snapshot = await service.snapshot('ws-1');

    expect(snapshot.llm).toBe('degraded');
  });
  it('survives a failing workspace lookup for whatsapp', async () => {
    prisma.workspace.findUnique.mockRejectedValueOnce(new Error('table missing'));

    const snapshot = await service.snapshot('ws-1');

    expect(snapshot.whatsapp).toBe('unknown');
    expect(snapshot.db).toBe('ok');
  });
});
