import { Test, TestingModule } from '@nestjs/testing';
import { memoryQueue } from '../queue/queue';
import { KnowledgeBaseService } from './knowledge-base.service';
import { PrismaService } from '../prisma/prisma.service';
import { VectorService } from './vector.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { AuditService } from '../audit/audit.service';
import { WalletService } from '../wallet/wallet.service';
import { InsufficientWalletBalanceError, UsagePriceNotFoundError } from '../wallet/wallet.types';

jest.mock('../queue/queue', () => ({
  memoryQueue: {
    add: jest.fn(),
  },
}));

describe('KnowledgeBaseService', () => {
  let service: KnowledgeBaseService;
  let htmlToText: (html: string) => string;
  let prisma: {
    knowledgeBase: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
    knowledgeSource: {
      create: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
    };
    $executeRaw: jest.Mock;
    $queryRaw: jest.Mock;
  };
  let walletService: {
    chargeForUsage: jest.Mock;
    refundUsageCharge: jest.Mock;
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = {
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
    };
    walletService = {
      chargeForUsage: jest.fn(),
      refundUsageCharge: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KnowledgeBaseService,
        {
          provide: PrismaService,
          useValue: prisma,
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
        {
          provide: WalletService,
          useValue: walletService,
        },
      ],
    }).compile();

    service = module.get<KnowledgeBaseService>(KnowledgeBaseService);
    htmlToText = Reflect.get(service, 'htmlToText') as (html: string) => string;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('htmlToText', () => {
    it('should extract visible text and preserve natural spacing', () => {
      const text =
        '<p>Hello world.</p><div>This is a test.</div><article>Another sentence here.</article>';
      const plainText = htmlToText.call(service, text);

      expect(plainText).toBe('Hello world. This is a test. Another sentence here.');
    });

    it('should ignore script/style tags while flattening markup', () => {
      const text =
        '<div>Visible copy</div><script>window.secret = true;</script><style>body{display:none}</style><span>More text</span>';
      const plainText = htmlToText.call(service, text);

      expect(plainText).toBe('Visible copy More text');
    });
  });

  describe('addSource wallet enforcement', () => {
    beforeEach(() => {
      prisma.knowledgeBase.findUnique.mockResolvedValue({ workspaceId: 'ws_1' });
      prisma.knowledgeSource.create.mockResolvedValue({
        id: 'src_1',
        knowledgeBaseId: 'kb_1',
        type: 'TEXT',
        content: 'conteudo...',
        status: 'PENDING',
      });
      (memoryQueue.add as jest.Mock).mockResolvedValue(undefined);
    });

    it('charges kb_ingestion before dispatching the ingestion job', async () => {
      const result = await service.addSource('kb_1', 'TEXT', 'conteudo bruto', undefined, {
        requestId: 'kb-req-1',
      });

      expect(walletService.chargeForUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws_1',
          operation: 'kb_ingestion',
          quotedCostCents: expect.anything(),
          requestId: 'kb-req-1',
        }),
      );
      expect(typeof walletService.chargeForUsage.mock.calls[0][0].quotedCostCents).toBe('bigint');
      expect(memoryQueue.add).toHaveBeenCalledWith(
        'ingest-source',
        expect.objectContaining({
          workspaceId: 'ws_1',
          sourceId: 'src_1',
          type: 'TEXT',
          walletUsage: {
            operation: 'kb_ingestion',
            requestId: 'kb-req-1',
            billing: expect.objectContaining({
              model: 'text-embedding-3-small',
            }),
          },
        }),
        { jobId: 'ingest-source:src_1' },
      );
      expect(result).toEqual(
        expect.objectContaining({
          id: 'src_1',
          status: 'PENDING',
        }),
      );
    });

    it('skips kb_ingestion debit when UsagePrice is not configured yet', async () => {
      walletService.chargeForUsage.mockRejectedValueOnce(
        new UsagePriceNotFoundError('kb_ingestion'),
      );

      await expect(
        service.addSource('kb_1', 'TEXT', 'conteudo bruto', undefined, {
          requestId: 'kb-req-2',
        }),
      ).resolves.toEqual(
        expect.objectContaining({
          id: 'src_1',
        }),
      );

      expect(memoryQueue.add).toHaveBeenCalledWith(
        'ingest-source',
        expect.objectContaining({
          walletUsage: null,
        }),
        { jobId: 'ingest-source:src_1' },
      );
      expect(walletService.refundUsageCharge).not.toHaveBeenCalled();
    });

    it('rejects source ingestion when wallet balance is insufficient', async () => {
      walletService.chargeForUsage.mockRejectedValueOnce(
        new InsufficientWalletBalanceError('wallet_1', 100n, 0n),
      );

      await expect(
        service.addSource('kb_1', 'TEXT', 'conteudo bruto', undefined, {
          requestId: 'kb-req-3',
        }),
      ).rejects.toMatchObject({
        name: 'KnowledgeBaseWalletAccessError',
      });

      expect(prisma.knowledgeSource.create).not.toHaveBeenCalled();
      expect(memoryQueue.add).not.toHaveBeenCalled();
    });

    it('refunds kb_ingestion when queue dispatch fails after the debit', async () => {
      (memoryQueue.add as jest.Mock).mockRejectedValueOnce(new Error('redis down'));

      await expect(
        service.addSource('kb_1', 'TEXT', 'conteudo bruto', undefined, {
          requestId: 'kb-req-4',
        }),
      ).rejects.toThrow('redis down');

      expect(walletService.refundUsageCharge).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws_1',
          operation: 'kb_ingestion',
          requestId: 'kb-req-4',
          reason: 'knowledge_base_ingestion_enqueue_failed',
        }),
      );
      expect(prisma.knowledgeSource.update).toHaveBeenCalledWith({
        where: { id: 'src_1' },
        data: { status: 'FAILED' },
      });
    });
  });
});
