import { Test, TestingModule } from '@nestjs/testing';
import { KnowledgeBaseService } from './knowledge-base.service';
import { PrismaService } from '../prisma/prisma.service';
import { VectorService } from './vector.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { AuditService } from '../audit/audit.service';

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
            getEmbedding: jest.fn().mockResolvedValue({
              embedding: [0.1, 0.2, 0.3],
              tokensUsed: 10,
            }),
          },
        },
        {
          provide: PlanLimitsService,
          useValue: { trackAiUsage: jest.fn() },
        },
        {
          provide: AuditService,
          useValue: { log: jest.fn(), logWithTx: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<KnowledgeBaseService>(KnowledgeBaseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('htmlToText', () => {
    it('should extract visible text and preserve natural spacing', () => {
      const text =
        '<p>Hello world.</p><div>This is a test.</div><article>Another sentence here.</article>';
      const plainText = (service as any).htmlToText(text);

      expect(plainText).toBe('Hello world. This is a test. Another sentence here.');
    });

    it('should ignore script/style tags while flattening markup', () => {
      const text =
        '<div>Visible copy</div><script>window.secret = true;</script><style>body{display:none}</style><span>More text</span>';
      const plainText = (service as any).htmlToText(text);

      expect(plainText).toBe('Visible copy More text');
    });
  });
});
