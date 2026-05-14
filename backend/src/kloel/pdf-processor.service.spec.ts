import { Test, TestingModule } from '@nestjs/testing';
import { PdfProcessorService } from './pdf-processor.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { MemoryService } from './memory.service';
jest.mock('openai', () => ({
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: jest.fn() } },
  })),
}));

jest.mock('./openai-wrapper', () => ({
  chatCompletionWithRetry: jest.fn(),
}));

jest.mock('../lib/openai-models', () => ({
  resolveBackendOpenAIModel: jest.fn().mockReturnValue('gpt-4o'),
}));

jest.mock('../common/async-sequence', () => ({
  forEachSequential: jest.fn(
    async <T>(items: T[], fn: (item: T, index: number) => Promise<void>) => {
      for (let i = 0; i < items.length; i++) {
        await fn(items[i], i);
      }
    },
  ),
}));

const mockChatCompletionWithRetry = jest.requireMock('./openai-wrapper').chatCompletionWithRetry;

describe('PdfProcessorService', () => {
  let service: PdfProcessorService;
  let memoryService: Pick<MemoryService, 'saveProduct' | 'saveMemory'>;
  let planLimits: Pick<PlanLimitsService, 'ensureTokenBudget'>;

  const wsId = 'ws-1';

  beforeEach(async () => {
    memoryService = {
      saveProduct: jest.fn().mockResolvedValue({}),
      saveMemory: jest.fn().mockResolvedValue({}),
    };
    planLimits = {
      ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
    };

    mockChatCompletionWithRetry.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              products: [
                {
                  name: 'Produto A',
                  description: 'Descrição A',
                  price: 99.9,
                  benefits: ['Benefício 1'],
                },
              ],
              companyInfo: 'Empresa XYZ',
              salesScript: 'Script de vendas',
              objections: [{ objection: 'Muito caro', response: 'Mas vale a pena' }],
              keyPoints: ['Ponto chave 1'],
            }),
          },
        },
      ],
      usage: { total_tokens: 100 },
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfProcessorService,
        { provide: PlanLimitsService, useValue: planLimits },
        { provide: MemoryService, useValue: memoryService },
      ],
    }).compile();

    service = module.get<PdfProcessorService>(PdfProcessorService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('processText', () => {
    it('analyzes text and returns analysis result', async () => {
      const result = await service.processText(wsId, 'Texto do PDF', 'documento.pdf');

      expect(result.products).toBeInstanceOf(Array);
      expect(result.companyInfo).toBe('Empresa XYZ');
    });

    it('calls OpenAI with brain model', async () => {
      await service.processText(wsId, 'Texto do PDF', 'doc.pdf');

      const [clientArg, requestArg] = mockChatCompletionWithRetry.mock.calls[0] ?? [];
      expect(clientArg).toBeDefined();
      expect(requestArg).toMatchObject({
        model: 'gpt-4o',
        temperature: 0.3,
      });
    });

    it('saves products to memory via memoryService', async () => {
      await service.processText(wsId, 'Texto do PDF', 'documento.pdf');

      expect(memoryService.saveProduct).toHaveBeenCalledWith(
        wsId,
        expect.stringContaining('documento_pdf_product_0'),
        expect.objectContaining({
          name: 'Produto A',
          description: 'Descrição A',
          price: 99.9,
        }),
      );
    });

    it('saves companyInfo to memory', async () => {
      await service.processText(wsId, 'Conteúdo', 'doc.pdf');

      expect(memoryService.saveMemory).toHaveBeenCalledWith(
        wsId,
        expect.stringContaining('company_info'),
        { source: 'doc.pdf' },
        'company_info',
        'Empresa XYZ',
      );
    });

    it('saves salesScript to memory', async () => {
      await service.processText(wsId, 'Conteúdo', 'doc.pdf');

      expect(memoryService.saveMemory).toHaveBeenCalledWith(
        wsId,
        expect.stringContaining('sales_script'),
        { source: 'doc.pdf' },
        'script',
        'Script de vendas',
      );
    });

    it('saves objections to memory', async () => {
      await service.processText(wsId, 'Conteúdo', 'doc.pdf');

      expect(memoryService.saveMemory).toHaveBeenCalledWith(
        wsId,
        expect.stringContaining('objection_0'),
        { objection: 'Muito caro', response: 'Mas vale a pena' },
        'objection',
        expect.stringContaining('Muito caro'),
      );
    });

    it('checks token budget before AI call', async () => {
      await service.processText(wsId, 'Texto', 'doc.pdf');

      expect(planLimits.ensureTokenBudget).toHaveBeenCalledWith(wsId);
    });
  });

  describe('processTextWithUsage', () => {
    it('returns usage info along with analysis', async () => {
      const result = await service.processTextWithUsage(wsId, 'Texto', 'doc.pdf');

      expect(result.usage).toEqual({ total_tokens: 100 });
      expect(result.analysis).toEqual(expect.objectContaining({ companyInfo: 'Empresa XYZ' }));
    });

    it('handles empty analysis gracefully', async () => {
      mockChatCompletionWithRetry.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                products: [],
                companyInfo: '',
                salesScript: '',
                objections: [],
                keyPoints: [],
              }),
            },
          },
        ],
        usage: { total_tokens: 50 },
      });

      const result = await service.processTextWithUsage(wsId, 'Conteúdo vazio', 'vazio.pdf');

      expect(result.analysis.products).toHaveLength(0);
    });
  });

  describe('tenant isolation', () => {
    it('passes workspaceId to memoryService.saveProduct', async () => {
      await service.processText('ws-tenant', 'Texto', 'doc.pdf');

      expect(memoryService.saveProduct).toHaveBeenCalledWith('ws-tenant', 'doc_pdf_product_0', {
        benefits: ['Benefício 1'],
        description: 'Descrição A',
        name: 'Produto A',
        price: 99.9,
      });
    });

    it('passes workspaceId to memoryService.saveMemory', async () => {
      await service.processText('ws-tenant', 'Conteúdo', 'doc.pdf');

      expect(memoryService.saveMemory).toHaveBeenCalledWith(
        'ws-tenant',
        'doc_pdf_company_info',
        { source: 'doc.pdf' },
        'company_info',
        'Empresa XYZ',
      );
    });

    it('passes workspaceId to planLimits.ensureTokenBudget', async () => {
      await service.processText('ws-tenant', 'Texto', 'doc.pdf');

      expect(planLimits.ensureTokenBudget).toHaveBeenCalledWith('ws-tenant');
    });
  });

  describe('error handling', () => {
    it('propagates AI analysis error in strict mode', async () => {
      mockChatCompletionWithRetry.mockRejectedValue(new Error('AI down'));

      await expect(service.processText(wsId, 'Texto', 'doc.pdf')).rejects.toThrow('AI down');
    });

    it('propagates token budget error', async () => {
      planLimits.ensureTokenBudget = jest.fn().mockRejectedValue(new Error('token limit exceeded'));

      await expect(service.processText(wsId, 'Texto', 'doc.pdf')).rejects.toThrow(
        'token limit exceeded',
      );
    });
  });
});
