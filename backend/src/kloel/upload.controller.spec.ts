const mockPdfParse = jest.fn();

jest.mock('pdf-parse', () => ({
  __esModule: true,
  default: mockPdfParse,
}));

import { HttpException } from '@nestjs/common';

import { InsufficientWalletBalanceError } from '../wallet/wallet.types';

import { UploadController } from './upload.controller';

describe('UploadController', () => {
  let controller: UploadController;
  let pdfProcessor: {
    processTextWithUsage: jest.Mock;
  };
  let memoryService: {
    saveMemory: jest.Mock;
  };
  let storageService: {
    upload: jest.Mock;
    delete: jest.Mock;
  };
  let walletService: {
    chargeForUsage: jest.Mock;
    settleUsageCharge: jest.Mock;
    refundUsageCharge: jest.Mock;
  };

  const req = { user: { workspaceId: 'ws_1' } } as never;
  const pdfFile = {
    fieldname: 'file',
    originalname: 'catalogo.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: 128,
    buffer: Buffer.from('%PDF-1.7\nmock pdf buffer'),
  };

  beforeEach(() => {
    mockPdfParse.mockReset();
    mockPdfParse.mockResolvedValue({
      text: 'Conteudo comercial suficiente para analise do documento PDF.',
      numpages: 2,
    });
    pdfProcessor = {
      processTextWithUsage: jest.fn(),
    };
    memoryService = {
      saveMemory: jest.fn().mockResolvedValue(undefined),
    };
    storageService = {
      upload: jest.fn().mockResolvedValue({
        url: 'https://files.test/catalogo.pdf',
        path: 'uploads/ws_1/catalogo.pdf',
        size: 128,
      }),
      delete: jest.fn().mockResolvedValue(true),
    };
    walletService = {
      chargeForUsage: jest.fn().mockResolvedValue(undefined),
      settleUsageCharge: jest.fn().mockResolvedValue(undefined),
      refundUsageCharge: jest.fn().mockResolvedValue(undefined),
    };
    controller = new UploadController(
      pdfProcessor as never,
      memoryService as never,
      storageService as never,
      walletService as never,
    );
  });

  it('charges before storage side effects and settles after a successful PDF upload analysis', async () => {
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

    const result = await controller.uploadFile(pdfFile, req);

    expect(result).toMatchObject({
      success: true,
      filename: 'catalogo.pdf',
      type: 'pdf',
      processed: true,
      url: 'https://files.test/catalogo.pdf',
      storagePath: 'uploads/ws_1/catalogo.pdf',
      analysis: {
        products: 1,
        hasCompanyInfo: true,
        objections: 1,
      },
    });
    expect(walletService.chargeForUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws_1',
        operation: 'ai_message',
        quotedCostCents: expect.anything(),
      }),
    );
    expect(walletService.chargeForUsage.mock.invocationCallOrder[0]).toBeLessThan(
      storageService.upload.mock.invocationCallOrder[0],
    );
    expect(walletService.settleUsageCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws_1',
        operation: 'ai_message',
        reason: 'upload_pdf_provider_usage',
      }),
    );
    expect(storageService.delete).not.toHaveBeenCalled();
  });

  it('returns HTTP 402 before uploading when wallet balance is insufficient', async () => {
    walletService.chargeForUsage.mockRejectedValueOnce(
      new InsufficientWalletBalanceError('wallet_1', 100n, 0n),
    );

    try {
      await controller.uploadFile(pdfFile, req);
      throw new Error('expected payment required exception');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(402);
    }

    expect(storageService.upload).not.toHaveBeenCalled();
    expect(pdfProcessor.processTextWithUsage).not.toHaveBeenCalled();
  });

  it('refunds usage and deletes partial storage when PDF processing fails after debit', async () => {
    pdfProcessor.processTextWithUsage.mockRejectedValue(new Error('analysis provider failed'));

    await expect(controller.uploadFile(pdfFile, req)).rejects.toThrow('analysis provider failed');

    expect(walletService.refundUsageCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws_1',
        operation: 'ai_message',
        reason: 'upload_pdf_provider_exception',
      }),
    );
    expect(storageService.delete).toHaveBeenCalledWith('uploads/ws_1/catalogo.pdf');
    expect(walletService.settleUsageCharge).not.toHaveBeenCalled();
  });
});
