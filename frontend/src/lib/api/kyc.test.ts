import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { kycApi } from './kyc';

type KycLookupApi = typeof kycApi & {
  lookupCnpj(cnpj: string): Promise<unknown>;
  lookupCep(cep: string): Promise<unknown>;
  revokeSecuritySession(sessionId: string): Promise<unknown>;
};

const lookupApi = kycApi as KycLookupApi;

beforeEach(() => {
  document.cookie = 'kloel_access_token=test-token; path=/';
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ razao_social: 'ACME LTDA', logradouro: 'Praca da Se' }),
  } as Response);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function lastFetchUrl(): string {
  const call = vi.mocked(globalThis.fetch).mock.calls.at(-1);
  const input = call?.[0];
  return input instanceof Request ? input.url : String(input ?? '');
}

describe('kycApi lookups', () => {
  it('normalizes CNPJ and calls the authenticated backend lookup', async () => {
    await expect(lookupApi.lookupCnpj('12.345.678/0001-90')).resolves.toEqual({
      razao_social: 'ACME LTDA',
      logradouro: 'Praca da Se',
    });

    expect(lastFetchUrl()).toContain('/kyc/lookup/cnpj/12345678000190');
  });

  it('normalizes CEP and calls the authenticated backend lookup', async () => {
    await lookupApi.lookupCep('01001-000');
    expect(lastFetchUrl()).toContain('/kyc/lookup/cep/01001000');
  });

  it('rejects malformed lookup inputs before network I/O', async () => {
    await expect(lookupApi.lookupCnpj('123')).rejects.toThrow('CNPJ invalido');
    await expect(lookupApi.lookupCep('123')).rejects.toThrow('CEP invalido');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('revokes an authenticated security session through the backend endpoint', async () => {
    await lookupApi.revokeSecuritySession('rt-1');

    expect(lastFetchUrl()).toContain('/kyc/security/sessions/rt-1');
    const request = vi.mocked(globalThis.fetch).mock.calls.at(-1)?.[0];
    expect(request).toBeInstanceOf(Request);
    expect((request as Request).method).toBe('DELETE');
  });
});
