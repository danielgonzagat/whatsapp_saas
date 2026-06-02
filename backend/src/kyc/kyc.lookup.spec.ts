import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { BRASIL_PROVIDER_HEADERS } from './kyc.lookup.helpers';
import { buildService } from './kyc.service.spec.helpers';

function buildLookupService() {
  return buildService().service;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('KycService public lookups', () => {
  it('normalizes CNPJ and proxies the BrasilAPI payload', async () => {
    const payload = { razao_social: 'ACME LTDA', cep: '01001000' };
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => payload,
    } as Response);

    await expect(buildLookupService().lookupCnpj('12.345.678/0001-90')).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith('https://brasilapi.com.br/api/cnpj/v1/12345678000190', {
      headers: BRASIL_PROVIDER_HEADERS,
    });
  });

  it('normalizes CEP and proxies the ViaCEP payload', async () => {
    const payload = { logradouro: 'Praca da Se', localidade: 'Sao Paulo', uf: 'SP' };
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => payload,
    } as Response);

    await expect(buildLookupService().lookupCep('01001-000')).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith('https://viacep.com.br/ws/01001000/json/', {
      headers: BRASIL_PROVIDER_HEADERS,
    });
  });

  it('normalizes and sorts Brazilian banks from BrasilAPI', async () => {
    const payload = [
      {
        code: '33',
        name: 'SANTANDER',
        fullName: 'Banco Santander (Brasil) S.A.',
        ispb: '90400888',
      },
      { code: null, name: 'INVALID', fullName: 'Invalid', ispb: '00000000' },
      { code: 1, name: 'BCO DO BRASIL S.A.', fullName: 'Banco do Brasil S.A.', ispb: '00000000' },
    ];
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => payload,
    } as Response);

    await expect(buildLookupService().listBrazilianBanks()).resolves.toEqual([
      { code: 1, name: 'BCO DO BRASIL S.A.', fullName: 'Banco do Brasil S.A.', ispb: '00000000' },
      { code: 33, name: 'SANTANDER', fullName: 'Banco Santander (Brasil) S.A.', ispb: '90400888' },
    ]);
    expect(fetchMock).toHaveBeenCalledWith('https://brasilapi.com.br/api/banks/v1', {
      headers: BRASIL_PROVIDER_HEADERS,
    });
  });

  it('getDocuments returns file metadata and rejection review fields', async () => {
    const { service, prisma } = buildService();

    await service.getDocuments('agent_1', 'ws_1');

    expect(prisma.kycDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { agentId: 'agent_1', workspaceId: 'ws_1' },
        select: expect.objectContaining({
          fileName: true,
          fileSize: true,
          mimeType: true,
          fileUrl: true,
          rejectedReason: true,
          reviewedAt: true,
        }),
      }),
    );
  });

  it('rejects malformed lookup identifiers before network I/O', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch');

    await expect(buildLookupService().lookupCnpj('123')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(buildLookupService().lookupCep('123')).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces provider outages as service unavailable', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

    await expect(buildLookupService().lookupCnpj('12.345.678/0001-90')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
