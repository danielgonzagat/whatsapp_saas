import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { SmartTimeService } from './smart-time.service';

describe('SmartTimeService', () => {
  let service: SmartTimeService;
  let prismaFindMany: jest.Mock;

  beforeEach(async () => {
    prismaFindMany = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmartTimeService,
        {
          provide: PrismaService,
          useValue: { message: { findMany: prismaFindMany } },
        },
      ],
    }).compile();

    service = module.get<SmartTimeService>(SmartTimeService);
  });

  it('returns default best time when there are no inbound messages', async () => {
    prismaFindMany.mockResolvedValue([]);

    const result = await service.getBestTime('ws-1');

    expect(result).toEqual({
      bestHours: [10],
      bestDays: ['Seg'],
      peakHour: 10,
      peakDay: 'Seg',
      heatmap: [],
      confidence: 'LOW',
      totalAnalyzed: 0,
    });
  });

  it('computes best hour and day from recent inbound messages', async () => {
    const now = new Date();
    const messages = [
      { createdAt: new Date(now.getTime() - 1000) },
      { createdAt: new Date(now.getTime() - 2000) },
      { createdAt: new Date(now.getTime() - 3000) },
    ];
    prismaFindMany.mockResolvedValue(messages);

    const result = await service.getBestTime('ws-1');

    expect(result.peakHour).toBeGreaterThanOrEqual(0);
    expect(result.peakHour).toBeLessThanOrEqual(23);
    expect(result.bestHours.length).toBeGreaterThanOrEqual(1);
    expect(result.bestDays.length).toBeGreaterThanOrEqual(1);
    expect(typeof result.peakDay).toBe('string');
    expect(typeof result.confidence).toBe('string');
    expect(Array.isArray(result.heatmap)).toBe(true);
    expect(result.totalAnalyzed).toBe(messages.length);
  });

  it('returns HIGH confidence when peak hour is clearly dominant', async () => {
    const now = new Date();
    const peakHour = 14;
    // Create 200 messages at peak hour, 5 at each other hour
    const messages: Array<{ createdAt: Date }> = [];
    for (let i = 0; i < 200; i++) {
      const d = new Date(now.getTime() - i * 60000);
      d.setHours(peakHour);
      messages.push({ createdAt: d });
    }
    for (let h = 0; h < 24; h++) {
      if (h === peakHour) continue;
      for (let i = 0; i < 5; i++) {
        const d = new Date(now.getTime());
        d.setHours(h);
        messages.push({ createdAt: d });
      }
    }
    prismaFindMany.mockResolvedValue(messages);

    const result = await service.getBestTime('ws-1');

    expect(result.peakHour).toBe(peakHour);
    expect(result.confidence).toBe('HIGH');
  });

  it('queries only the last 30 days of inbound messages', async () => {
    prismaFindMany.mockResolvedValue([]);

    await service.getBestTime('ws-1');

    const args = prismaFindMany.mock.calls[0][0];
    expect(args.where.direction).toBe('INBOUND');
    expect(args.where.createdAt.gte).toBeInstanceOf(Date);
  });
});
