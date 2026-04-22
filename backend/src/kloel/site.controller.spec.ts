import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { SiteController } from './site.controller';
import { InsufficientWalletBalanceError } from '../wallet/wallet.types';

describe('SiteController', () => {
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  let controller: SiteController;
  let walletService: {
    chargeForUsage: jest.Mock;
    settleUsageCharge: jest.Mock;
    refundUsageCharge: jest.Mock;
  };

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'openai_test_key';
    delete process.env.ANTHROPIC_API_KEY;
    fetchMock = jest.spyOn(global, 'fetch');
    walletService = {
      chargeForUsage: jest.fn().mockResolvedValue(undefined),
      settleUsageCharge: jest.fn().mockResolvedValue(undefined),
      refundUsageCharge: jest.fn().mockResolvedValue(undefined),
    };
    controller = new SiteController(
      {
        kloelSite: {
          findMany: jest.fn(),
          create: jest.fn(),
          findFirst: jest.fn(),
          updateMany: jest.fn(),
          deleteMany: jest.fn(),
        },
      } as never,
      { log: jest.fn() } as never,
      walletService as never,
    );
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

  it('charges and settles wallet usage for OpenAI site generation', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '<html>ok</html>' } }],
        usage: {
          prompt_tokens: 1_000,
          completion_tokens: 500,
          prompt_tokens_details: { cached_tokens: 0 },
        },
      }),
    } as Response);

    const result = await controller.generateSite({ user: { workspaceId: 'ws_1' } } as never, {
      prompt: 'Crie uma landing page',
    });

    expect(result).toEqual({
      success: true,
      html: '<html>ok</html>',
      message: 'Generated via OpenAI',
    });
    expect(walletService.chargeForUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws_1',
        operation: 'ai_message',
        quotedCostCents: expect.anything(),
      }),
    );
    expect(walletService.settleUsageCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws_1',
        operation: 'ai_message',
        actualCostCents: expect.anything(),
        reason: 'site_generation_provider_usage',
      }),
    );
  });

  it('charges and settles wallet usage for Anthropic site generation', async () => {
    delete process.env.OPENAI_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'anthropic_test_key';
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ text: '<html>anthropic</html>' }],
        usage: {
          input_tokens: 1_000,
          output_tokens: 500,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      }),
    } as Response);

    const result = await controller.generateSite({ user: { workspaceId: 'ws_1' } } as never, {
      prompt: 'Crie uma landing page',
    });

    expect(result).toEqual({
      success: true,
      html: '<html>anthropic</html>',
      message: 'Generated via Anthropic',
    });
    expect(walletService.chargeForUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws_1',
        operation: 'ai_message',
        quotedCostCents: expect.anything(),
      }),
    );
    expect(walletService.settleUsageCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws_1',
        operation: 'ai_message',
        actualCostCents: expect.anything(),
      }),
    );
  });

  it('returns HTTP 402 when wallet balance is insufficient', async () => {
    walletService.chargeForUsage.mockRejectedValueOnce(
      new InsufficientWalletBalanceError('wallet_1', 100n, 0n),
    );

    try {
      await controller.generateSite({ user: { workspaceId: 'ws_1' } } as never, {
        prompt: 'Crie',
      });
      throw new Error('expected wallet payment required exception');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(402);
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refunds the wallet when provider generation fails after debit', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      text: async () => 'boom',
    } as Response);

    await expect(
      controller.generateSite({ user: { workspaceId: 'ws_1' } } as never, { prompt: 'Crie' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(walletService.refundUsageCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws_1',
        operation: 'ai_message',
        reason: 'site_generation_provider_exception',
      }),
    );
  });
});
