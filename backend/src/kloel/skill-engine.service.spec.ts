import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { SkillEngineService } from './skill-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { MemoryService } from './memory.service';
import { PaymentService } from './payment.service';

describe('SkillEngineService', () => {
  let service: SkillEngineService;

  const mockPrisma = {};
  const getSalesContext = jest
    .fn<() => Promise<string>>()
    .mockResolvedValue('');
  const mockMemory: any = { getSalesContext };
  const mockPayment = {};

  beforeEach(async () => {
    delete process.env.OPENAI_API_KEY;
    process.env.NODE_ENV = 'test';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SkillEngineService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MemoryService, useValue: mockMemory },
        { provide: PaymentService, useValue: mockPayment },
      ],
    }).compile();

    service = module.get<SkillEngineService>(SkillEngineService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('processWithSkills() retorna fallback quando OPENAI_API_KEY não está configurada', async () => {
    const result = await service.processWithSkills(
      'ws-1',
      '5511999999999',
      'Olá',
      [],
    );

    expect(result).toEqual(
      expect.objectContaining({
        response: expect.any(String),
        skillsUsed: [],
        actions: [],
        error: 'OPENAI_API_KEY missing',
      }),
    );
  });
});
