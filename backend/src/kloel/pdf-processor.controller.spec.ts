import { HttpException } from '@nestjs/common';

import { InsufficientWalletBalanceError } from '../wallet/wallet.types';

import { PdfProcessorController } from './pdf-processor.controller';

describe('PdfProcessorController', () => {
  let controller: PdfProcessorController;
  let pdfProcessor: {
    processTextWithUsage: jest.Mock;
  };
  let walletService: {
    chargeForUsage: jest.Mock;
    settleUsageCharge: jest.Mock;
    refundUsageCharge: jest.Mock;
  };

  beforeEach(() => {
    pdfProcessor = {
      processTextWithUsage: jest.fn(),
    };
    walletService = {
      chargeForUsage: jest.fn().mockResolvedValue(undefined),
      settleUsageCharge: jest.fn().mockResolvedValue(undefined),
      refundUsageCharge: jest.fn().mockResolvedValue(undefined),
    };
    controller = new PdfProcessorController(pdfProcessor as never, walletService as never);
  });

  it('charges and settles wallet usage for direct text processing', async () => {
    pdfProcessor.processTextWithUsage.mockResolvedValue({
      analysis: {
        products: [{ name: 'Oferta principal' }],
        companyInfo: 'Empresa exemplo',
        objections: [{ objection: 'Preco', response: 'Parcelamos' }],
      },
      usage: {
        prompt_tokens: 1_000,
        completion_tokens: 500,
        prompt_tokens_details: { cached_tokens: 0 },
      },
    });

    const result = await controller.processText('ws_1', {
      text: 'Conteudo comercial suficiente para analise completa.',
      sourceName: 'catalogo.txt',
    });

    expect(result).toEqual({
      status: 'processed',
      sourceName: 'catalogo.txt',
      textLength: 52,
      analysis: {
        products: 1,
        hasCompanyInfo: true,
        objections: 1,
      },
      details: {
        products: [{ name: 'Oferta principal' }],
        companyInfo: 'Empresa exemplo',
        objections: [{ objection: 'Preco', response: 'Parcelamos' }],
      },
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
        reason: 'pdf_analysis_provider_usage',
        actualCostCents: expect.anything(),
      }),
    );
  });

  it('returns HTTP 402 when wallet balance is insufficient', async () => {
    walletService.chargeForUsage.mockRejectedValueOnce(
      new InsufficientWalletBalanceError('wallet_1', 100n, 0n),
    );

    try {
      await controller.processText('ws_1', {
        text: 'Conteudo comercial suficiente para analise completa.',
        sourceName: 'catalogo.txt',
      });
      throw new Error('expected payment required exception');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(402);
    }

    expect(pdfProcessor.processTextWithUsage).not.toHaveBeenCalled();
  });

  it('refunds wallet usage when downstream processing fails after debit', async () => {
    pdfProcessor.processTextWithUsage.mockRejectedValue(new Error('analysis provider failed'));

    await expect(
      controller.processText('ws_1', {
        text: 'Conteudo comercial suficiente para analise completa.',
        sourceName: 'catalogo.txt',
      }),
    ).rejects.toThrow('analysis provider failed');

    expect(walletService.refundUsageCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws_1',
        operation: 'ai_message',
        reason: 'pdf_analysis_provider_exception',
      }),
    );
    expect(walletService.settleUsageCharge).not.toHaveBeenCalled();
  });
});
