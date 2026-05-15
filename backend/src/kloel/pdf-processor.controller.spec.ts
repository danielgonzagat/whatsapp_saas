import { HttpException } from '@nestjs/common';

import { InsufficientWalletBalanceError } from '../wallet/wallet.types';

import { PdfProcessorController } from './pdf-processor.controller';

jest.mock('../wallet/provider-llm-billing', () => ({
  estimateOpenAiChatQuoteCostCents: jest.fn(() => 7n),
  quoteOpenAiChatActualCostCents: jest.fn(() => 5n),
}));

jest.mock('../lib/openai-models', () => {
  const actual = jest.requireActual<typeof import('../lib/openai-models')>('../lib/openai-models');
  return {
    ...actual,
    resolveBackendOpenAIModel: jest.fn(() => actual.CANONICAL_MODEL_IDS.openAiTextMini),
  };
});

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

  function textUploadFile(text = 'Conteudo comercial suficiente para analise completa.') {
    const buffer = Buffer.from(text, 'utf-8');
    return {
      buffer,
      mimetype: 'text/plain',
      originalname: 'catalogo.txt',
      size: buffer.length,
    };
  }

  it('charges and settles wallet usage for uploaded text processing', async () => {
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

    const result = await controller.uploadPdf('ws_1', textUploadFile());

    expect(result).toEqual({
      status: 'processed',
      filename: 'catalogo.txt',
      analysis: {
        products: 1,
        hasCompanyInfo: true,
        hasSalesScript: false,
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
      await controller.uploadPdf('ws_1', textUploadFile());
      throw new Error('expected payment required exception');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(402);
    }

    expect(pdfProcessor.processTextWithUsage).not.toHaveBeenCalled();
  });

  it('refunds wallet usage when downstream processing fails after debit', async () => {
    pdfProcessor.processTextWithUsage.mockRejectedValue(new Error('analysis provider failed'));

    await expect(controller.uploadPdf('ws_1', textUploadFile())).rejects.toThrow(
      'analysis provider failed',
    );

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
