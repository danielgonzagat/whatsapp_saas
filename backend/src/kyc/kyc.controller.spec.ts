import { describe, expect, it, jest } from '@jest/globals';
import { KycController } from './kyc.controller';
import type { KycService } from './kyc.service';

function buildController(kycService: object) {
  return new KycController(kycService as KycService);
}

describe('KycController', () => {
  it('forwards request IP and user-agent when submitting KYC', async () => {
    const submitResult = {
      success: true,
      status: 'submitted',
    };
    const kycService = {
      submitKyc: jest.fn<() => Promise<typeof submitResult>>().mockResolvedValue(submitResult),
    };
    const controller = buildController(kycService);

    const result = await controller.submitKyc(
      {
        user: {
          sub: 'agent_1',
          workspaceId: 'ws_1',
        },
      } as never,
      'Mozilla/5.0',
      '203.0.113.10, 198.51.100.22',
    );

    expect(kycService.submitKyc).toHaveBeenCalledWith('agent_1', 'ws_1', {
      ipAddress: '203.0.113.10',
      userAgent: 'Mozilla/5.0',
    });
    expect(result).toEqual(submitResult);
  });

  it('delegates CNPJ lookup to the authenticated KYC service', async () => {
    const payload = { razao_social: 'ACME LTDA' };
    const kycService = {
      lookupCnpj: jest.fn<() => Promise<typeof payload>>().mockResolvedValue(payload),
    };
    const controller = buildController(kycService);

    await expect(controller.lookupCnpj('12.345.678/0001-90')).resolves.toBe(payload);
    expect(kycService.lookupCnpj).toHaveBeenCalledWith('12.345.678/0001-90');
  });

  it('delegates CEP lookup to the authenticated KYC service', async () => {
    const payload = { logradouro: 'Praca da Se' };
    const kycService = {
      lookupCep: jest.fn<() => Promise<typeof payload>>().mockResolvedValue(payload),
    };
    const controller = buildController(kycService);

    await expect(controller.lookupCep('01001-000')).resolves.toBe(payload);
    expect(kycService.lookupCep).toHaveBeenCalledWith('01001-000');
  });

  it('delegates Brazilian bank list lookup to the authenticated KYC service', async () => {
    const payload = [
      { code: 1, name: 'BCO DO BRASIL S.A.', fullName: 'Banco do Brasil S.A.', ispb: '00000000' },
    ];
    const kycService = {
      listBrazilianBanks: jest.fn<() => Promise<typeof payload>>().mockResolvedValue(payload),
    };
    const controller = buildController(kycService);

    await expect(controller.listBrazilianBanks()).resolves.toBe(payload);
    expect(kycService.listBrazilianBanks).toHaveBeenCalledWith();
  });
});
