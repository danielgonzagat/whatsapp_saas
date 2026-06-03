import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import {
  BRASIL_PROVIDER_HEADERS,
  lookupCnpj,
  lookupCep,
  listBrazilianBanks,
} from './kyc.lookup.helpers';

const realFetch = global.fetch;

function fetchResult(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const fn = jest.fn(impl);
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

afterEach(() => {
  global.fetch = realFetch;
  jest.restoreAllMocks();
});

describe('kyc.lookup.helpers', () => {
  describe('BRASIL_PROVIDER_HEADERS', () => {
    it('carries a descriptive User-Agent so Cloudflare does not block the Node runtime', () => {
      expect(BRASIL_PROVIDER_HEADERS['User-Agent']).toContain('Kloel');
      expect(BRASIL_PROVIDER_HEADERS['User-Agent']).not.toBe('node');
      expect(BRASIL_PROVIDER_HEADERS.Accept).toBe('application/json');
    });
  });

  describe('lookupCnpj', () => {
    it('rejects a malformed CNPJ before a network call', async () => {
      const fetchMock = mockFetch(() => Promise.reject(new Error('should not reach the network')));
      await expect(lookupCnpj('123')).rejects.toBeInstanceOf(BadRequestException);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('calls BrasilAPI with the descriptive provider headers and returns the payload', async () => {
      const payload = { cnpj: '00000000000191', razao_social: 'BANCO DO BRASIL SA' };
      const fetchMock = mockFetch(() => Promise.resolve(fetchResult(200, payload)));
      const result = await lookupCnpj('00.000.000/0001-91');
      expect(result).toEqual(payload);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://brasilapi.com.br/api/cnpj/v1/00000000000191',
        expect.objectContaining({ headers: BRASIL_PROVIDER_HEADERS }),
      );
      const init = fetchMock.mock.calls[0]?.[1];
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    });

    it('maps a provider non-200 to a 400 BadRequest', async () => {
      mockFetch(() => Promise.resolve(fetchResult(404, '')));
      await expect(lookupCnpj('00000000000191')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('maps a network failure to a 503 ServiceUnavailable', async () => {
      mockFetch(() => Promise.reject(new Error('econnreset')));
      await expect(lookupCnpj('00000000000191')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('lookupCep', () => {
    it('calls ViaCEP with the descriptive provider headers and returns the payload', async () => {
      const payload = { cep: '01001-000', localidade: 'Sao Paulo' };
      const fetchMock = mockFetch(() => Promise.resolve(fetchResult(200, payload)));
      const result = await lookupCep('01001000');
      expect(result).toEqual(payload);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://viacep.com.br/ws/01001000/json/',
        expect.objectContaining({ headers: BRASIL_PROVIDER_HEADERS }),
      );
    });

    it('treats { erro: true } as not found', async () => {
      mockFetch(() => Promise.resolve(fetchResult(200, { erro: true })));
      await expect(lookupCep('00000000')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('listBrazilianBanks', () => {
    it('calls BrasilAPI with the descriptive provider headers and normalizes rows', async () => {
      const fetchMock = mockFetch(() =>
        Promise.resolve(
          fetchResult(200, [
            {
              code: 1,
              name: 'BCO DO BRASIL S.A.',
              fullName: 'Banco do Brasil S.A.',
              ispb: '00000000',
            },
            { code: null, name: 'invalid', fullName: 'invalid', ispb: '' },
          ]),
        ),
      );
      const banks = await listBrazilianBanks();
      expect(fetchMock).toHaveBeenCalledWith(
        'https://brasilapi.com.br/api/banks/v1',
        expect.objectContaining({ headers: BRASIL_PROVIDER_HEADERS }),
      );
      expect(banks).toHaveLength(1);
      expect(banks[0]).toMatchObject({ code: 1, name: 'BCO DO BRASIL S.A.' });
    });

    it('maps a provider failure to a 503 ServiceUnavailable', async () => {
      mockFetch(() => Promise.resolve(fetchResult(500, '')));
      await expect(listBrazilianBanks()).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });
});
