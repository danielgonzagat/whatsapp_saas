import { Test, TestingModule } from '@nestjs/testing';
import { KloelComposerService } from './kloel-composer.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { StorageService } from '../common/storage/storage.service';
import { KLOEL_COMPOSER_E2E_GUARD, KloelComposerE2EGuard } from './kloel-composer-e2e-guard';

jest.mock('openai', () => ({
  default: jest.fn().mockImplementation(() => ({
    apiKey: 'mock-key',
    responses: { create: jest.fn().mockResolvedValue({ output_text: '', output: [], usage: {} }) },
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({ choices: [{ message: { content: '' } }], usage: {} }),
      },
    },
    images: { generate: jest.fn().mockResolvedValue({ data: [{}] }) },
  })),
}));

jest.mock('../lib/ai-models', () => {
  const { CANONICAL_MODEL_IDS } =
    jest.requireActual<typeof import('../lib/openai-models')>('../lib/openai-models');

  return {
    resolveKloelCapabilityModel: jest.fn((capability: string) => {
      if (capability === 'search_web') {
        return CANONICAL_MODEL_IDS.openAiTextOmni;
      }
      if (capability === 'create_image') {
        return CANONICAL_MODEL_IDS.imageGeneration;
      }
      return CANONICAL_MODEL_IDS.anthropicSonnetTest;
    }),
  };
});

describe('KloelComposerService', () => {
  let service: KloelComposerService;
  let planLimits: Pick<PlanLimitsService, 'ensureTokenBudget' | 'trackAiUsage'>;
  let storageService: Pick<StorageService, 'upload' | 'uploadFromUrl'>;
  let e2EGuard: Pick<KloelComposerE2EGuard, 'isEnabled' | 'buildSearchResult' | 'buildImageResult'>;
  let originalOpenAiApiKey: string | undefined;

  beforeEach(async () => {
    originalOpenAiApiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'test-openai-key';
    planLimits = {
      ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
      trackAiUsage: jest.fn().mockResolvedValue(undefined),
    };
    storageService = {
      upload: jest.fn().mockResolvedValue({ url: 'https://storage.test/image.png' }),
      uploadFromUrl: jest.fn().mockResolvedValue({ url: 'https://storage.test/image.png' }),
    };
    e2EGuard = {
      isEnabled: jest.fn().mockReturnValue(false),
      buildSearchResult: jest.fn().mockReturnValue({
        answer: 'E2E search result',
        sources: [{ title: 'Test', url: 'https://example.com' }],
      }),
      buildImageResult: jest.fn().mockReturnValue({
        content: 'E2E image',
        metadata: { test: true },
        estimatedTokens: 0,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KloelComposerService,
        { provide: PlanLimitsService, useValue: planLimits },
        { provide: StorageService, useValue: storageService },
        { provide: KLOEL_COMPOSER_E2E_GUARD, useValue: e2EGuard },
      ],
    }).compile();

    service = module.get<KloelComposerService>(KloelComposerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    if (originalOpenAiApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiApiKey;
    }
  });

  describe('buildCapabilityPrompt', () => {
    it('joins message and context', () => {
      const prompt = service.buildCapabilityPrompt('Hello', 'Context');
      expect(prompt).toBe('Hello\n\nContext');
    });

    it('handles missing context', () => {
      const prompt = service.buildCapabilityPrompt('Hello', '');
      expect(prompt).toBe('Hello');
    });

    it('handles nullish composerContext', () => {
      const prompt = service.buildCapabilityPrompt('Hello', undefined);
      expect(prompt).toBe('Hello');
    });
  });

  describe('formatSearchDigestAsMarkdown', () => {
    it('formats digest with sources', () => {
      const result = service.formatSearchDigestAsMarkdown({
        answer: 'Resposta',
        sources: [{ title: 'Fonte 1', url: 'https://example.com' }],
      });
      expect(result).toContain('Resposta');
      expect(result).toContain('Fonte 1');
      expect(result).toContain('https://example.com');
    });

    it('handles empty answer', () => {
      const result = service.formatSearchDigestAsMarkdown({
        answer: '',
        sources: [],
      });
      expect(result).toContain('Nenhum resultado');
    });

    it('handles no sources', () => {
      const result = service.formatSearchDigestAsMarkdown({
        answer: 'Teste',
        sources: [],
      });
      expect(result).toBe('Teste');
    });

    it('handles sources without titles', () => {
      const result = service.formatSearchDigestAsMarkdown({
        answer: 'A',
        sources: [{ title: '', url: 'https://x.com' }],
      });
      expect(result).toContain('https://x.com');
    });
  });

  describe('searchWeb', () => {
    it('returns e2e result when guard is enabled', async () => {
      e2EGuard.isEnabled = jest.fn().mockReturnValue(true);
      const result = await service.searchWeb('test query');
      expect(result.answer).toBe('E2E search result');
      expect(result.sources).toHaveLength(1);
    });

    it('returns empty for empty query', async () => {
      e2EGuard.isEnabled = jest.fn().mockReturnValue(true);
      const result = await service.searchWeb('');
      expect(result.answer).toBe('');
      expect(result.sources).toEqual([]);
    });
  });

  describe('executeComposerCapability', () => {
    it('throws for unsupported capability', async () => {
      await expect(
        service.executeComposerCapability({
          capability: 'unknown' as never,
          message: 'test',
        }),
      ).rejects.toThrow('não suportada');
    });

    it('executes search_web via e2e guard', async () => {
      e2EGuard.isEnabled = jest.fn().mockReturnValue(true);
      const result = await service.executeComposerCapability({
        capability: 'search_web',
        message: 'test',
      });
      expect(result.content).toContain('E2E search');
      expect(result.metadata?.capability).toBe('search_web');
    });

    it('executes refine_response through the central text LLM provider with workspace context', async () => {
      const textLlm = (
        service as unknown as {
          textLlm: {
            chat: {
              completions: {
                create: jest.Mock<
                  Promise<unknown>,
                  [
                    {
                      model: string;
                      messages: Array<{ role: 'user'; content: string }>;
                      temperature: number;
                    },
                    unknown?,
                  ]
                >;
              };
            };
          };
        }
      ).textLlm;
      textLlm.chat.completions.create.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: 'Mesa de refinamento pronta com cortes, lacunas e próxima versão.',
            },
          },
        ],
        usage: { total_tokens: 321 },
      });

      const result = await service.executeComposerCapability({
        capability: 'refine_response',
        message: 'Refine a resposta sobre o produto expondo raciocínio bruto real quando existir.',
        workspaceId: 'ws-refine',
        composerContext: 'Produto vinculado: Serum Graph Proof.',
      });

      const request = textLlm.chat.completions.create.mock.calls[0]?.[0];
      const prompt = request?.messages?.[0]?.content || '';
      expect(prompt).toContain('Mesa de refinamento');
      expect(prompt).toContain('Produto vinculado: Serum Graph Proof.');
      expect(prompt).toContain('preserve o raciocínio bruto/provider reasoning');
      expect(prompt).toContain('nomes públicos de ferramentas e capacidades podem aparecer');
      expect(prompt).toContain('tool/function calling');
      expect(prompt).toContain('Use Markdown real e respirado');
      expect(prompt).toContain('## Diagnóstico executivo');
      expect(result.content).toContain('Mesa de refinamento pronta');
      expect(result.metadata).toEqual(expect.objectContaining({ capability: 'refine_response' }));
      expect(planLimits.ensureTokenBudget).toHaveBeenCalledWith('ws-refine');
      expect(planLimits.trackAiUsage).toHaveBeenCalledWith('ws-refine', 321);
    });

    it('normalizes refine_response markdown before returning content', async () => {
      const textLlm = (
        service as unknown as {
          textLlm: {
            chat: { completions: { create: jest.Mock<Promise<unknown>, [unknown, unknown?]> } };
          };
        }
      ).textLlm;
      textLlm.chat.completions.create.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content:
                '## Diagnóstico executivo - Primeiro ponto. ## Lacunas e riscos - Risco um. ## Versão refinada Texto sugerido: - Reasoning summary – Resumo público. ## Próxima ação verificável - Validar com revisor.',
            },
          },
        ],
        usage: { total_tokens: 10 },
      });

      const result = await service.executeComposerCapability({
        capability: 'refine_response',
        message: 'Refine com markdown respirado.',
      });

      expect(result.content).toContain('## Diagnóstico executivo\n\n- Primeiro ponto.');
      expect(result.content).toContain('\n\n## Lacunas e riscos\n\n- Risco um.');
      expect(result.content).toContain(
        '\n\n## Versão refinada\n\nTexto sugerido:\n- Reasoning summary',
      );
      expect(result.content).not.toContain('## Diagnóstico executivo -');
    });

    it('executes create_image via e2e guard', async () => {
      e2EGuard.isEnabled = jest.fn().mockReturnValue(true);
      const result = await service.executeComposerCapability({
        capability: 'create_image',
        message: 'a cat',
      });
      expect(result.content).toContain('E2E image');
    });

    it('tracks AI usage for search_web with workspaceId', async () => {
      e2EGuard.isEnabled = jest.fn().mockReturnValue(true);
      e2EGuard.buildSearchResult = jest.fn().mockReturnValue({
        answer: 'Answer',
        sources: [],
        totalTokens: 500,
      });
      await service.executeComposerCapability({
        capability: 'search_web',
        message: 'test',
        workspaceId: 'ws-1',
      });
      expect(planLimits.trackAiUsage).toHaveBeenCalledWith('ws-1', 500);
    });

    it('returns e2e image result without budget check when guard enabled', async () => {
      e2EGuard.isEnabled = jest.fn().mockReturnValue(true);
      e2EGuard.buildImageResult = jest.fn().mockReturnValue({
        content: 'Image',
        metadata: {},
        estimatedTokens: 300,
      });
      await service.executeComposerCapability({
        capability: 'create_image',
        message: 'test',
        workspaceId: 'ws-1',
      });
      expect(e2EGuard.buildImageResult).toHaveBeenCalled();
    });

    it('checks token budget for search_web when workspaceId provided', async () => {
      e2EGuard.isEnabled = jest.fn().mockReturnValue(true);
      await service.executeComposerCapability({
        capability: 'search_web',
        message: 'test',
        workspaceId: 'ws-2',
      });
      expect(planLimits.ensureTokenBudget).toHaveBeenCalledWith('ws-2');
    });
  });

  describe('error handling', () => {
    it('executeComposerCapability propagates search_web errors', async () => {
      e2EGuard.isEnabled = jest.fn().mockReturnValue(false);
      const openai = (service as { openai: { responses: { create: jest.Mock } } }).openai;
      if (openai?.responses?.create) {
        openai.responses.create.mockRejectedValue(new Error('API error'));
        await expect(
          service.executeComposerCapability({
            capability: 'search_web',
            message: 'test',
          }),
        ).rejects.toThrow('API error');
      }
    });
  });
});
