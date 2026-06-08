import { SiteController } from './site.controller';

describe('SiteController fallback site generation', () => {
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
    if (originalOpenAiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiKey;
    }
    if (originalAnthropicKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    }
  });

  it('returns deterministic fallback HTML without charging when AI keys are not configured', async () => {
    const walletService = {
      chargeForUsage: jest.fn(),
      settleUsageCharge: jest.fn(),
      refundUsageCharge: jest.fn(),
    };
    const controller = new SiteController(
      {
        kloelSite: {
          findMany: jest.fn(),
          create: jest.fn(),
          findFirst: jest.fn(),
          updateMany: jest.fn(),
          deleteMany: jest.fn(),
        },
      } as unknown as ConstructorParameters<typeof SiteController>[0],
      { log: jest.fn() } as unknown as ConstructorParameters<typeof SiteController>[1],
      walletService as unknown as ConstructorParameters<typeof SiteController>[2],
    );
    const request = {
      user: { workspaceId: 'ws_1' },
    } as unknown as Parameters<SiteController['generateSite']>[0];

    const result = await controller.generateSite(request, {
      prompt: 'Curso de marketing digital',
    });

    expect(result.success).toBe(true);
    expect(result.message).toBe('Generated via deterministic fallback');
    expect(result.html).toContain('<!doctype html>');
    expect(result.html).toContain('Curso de marketing digital');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(walletService.chargeForUsage).not.toHaveBeenCalled();
  });

  it('preserves the existing page identity when deterministic fallback handles an edit', async () => {
    const walletService = {
      chargeForUsage: jest.fn(),
      settleUsageCharge: jest.fn(),
      refundUsageCharge: jest.fn(),
    };
    const controller = new SiteController(
      {
        kloelSite: {
          findMany: jest.fn(),
          create: jest.fn(),
          findFirst: jest.fn(),
          updateMany: jest.fn(),
          deleteMany: jest.fn(),
        },
      } as unknown as ConstructorParameters<typeof SiteController>[0],
      { log: jest.fn() } as unknown as ConstructorParameters<typeof SiteController>[1],
      walletService as unknown as ConstructorParameters<typeof SiteController>[2],
    );
    const request = {
      user: { workspaceId: 'ws_1' },
    } as unknown as Parameters<SiteController['generateSite']>[0];

    const result = await controller.generateSite(request, {
      prompt: 'Adicione uma prova social secundaria',
      currentHtml:
        '<!doctype html><html><head><title>Oferta Original</title></head><body><main><h1>Oferta Original</h1></main></body></html>',
    });

    expect(result.success).toBe(true);
    expect(result.html).toContain('<title>Oferta Original</title>');
    expect(result.html).toContain('<h1>Oferta Original</h1>');
    expect(result.html).toContain('Alteracao solicitada');
    expect(result.html).toContain('Adicione uma prova social secundaria');
    expect(result.html).not.toContain('<title>Adicione uma prova social secundaria</title>');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(walletService.chargeForUsage).not.toHaveBeenCalled();
  });
});
