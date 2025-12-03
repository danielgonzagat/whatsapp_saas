import { Test, TestingModule } from '@nestjs/testing';
import { KnowledgeBaseService } from './knowledge-base.service';
import { PrismaService } from '../prisma/prisma.service';
import { VectorService } from './vector.service';
import { PlanLimitsService } from '../billing/plan-limits.service';

describe('KnowledgeBaseService', () => {
  let service: KnowledgeBaseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KnowledgeBaseService,
        {
          provide: PrismaService,
          useValue: {
            knowledgeBase: {
              create: jest.fn(),
              findMany: jest.fn(),
              findUnique: jest.fn(),
            },
            knowledgeSource: {
              create: jest.fn(),
              update: jest.fn(),
              findMany: jest.fn(),
            },
            $executeRaw: jest.fn(),
            $queryRaw: jest.fn(),
          },
        },
        {
          provide: VectorService,
          useValue: {
            getEmbedding: jest
              .fn()
              .mockResolvedValue({ embedding: [0.1, 0.2, 0.3], tokensUsed: 10 }),
          },
        },
        {
          provide: PlanLimitsService,
          useValue: { trackAiUsage: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<KnowledgeBaseService>(KnowledgeBaseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('splitText', () => {
    it('should split text by sentence boundaries', () => {
      const text = 'Hello world. This is a test. Another sentence here.';
      // Access private method via casting to any
      const chunks = (service as any).splitText(text, 20, 5);

      // Expect chunks to respect sentence boundaries where possible
      // "Hello world." is 12 chars. " This is a test." is 16 chars.
      // Chunk size 20.
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0]).toContain('Hello world.');
    });

    it('should fallback to space splitting if no sentence boundary found', () => {
      const text =
        'ThisIsALongTextWithoutPunctuationButWithSpaces ToTestFallbackStrategy';
      const chunks = (service as any).splitText(text, 30, 5);
      expect(chunks.length).toBeGreaterThan(0);
    });
  });
});
