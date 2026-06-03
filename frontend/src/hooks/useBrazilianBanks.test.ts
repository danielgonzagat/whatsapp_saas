import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('swr', () => ({
  default: vi.fn(() => ({ data: undefined, error: undefined, isLoading: true })),
}));

vi.mock('@/lib/fetcher', () => ({
  swrFetcher: vi.fn(),
}));

import useSWR from 'swr';

import { useBrazilianBanks } from './useBrazilianBanks';

function mockSWR(data: unknown, isLoading = false, error: Error | undefined = undefined) {
  vi.mocked(useSWR).mockReturnValue({
    data,
    error,
    isLoading,
    mutate: vi.fn(),
    isValidating: false,
  });
}

describe('useBrazilianBanks', () => {
  beforeEach(() => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });
  });

  it('returns banks from the real /kyc/banks array payload', () => {
    const banks = [
      { code: 1, name: 'BCO DO BRASIL S.A.', fullName: 'Banco do Brasil S.A.', ispb: '00000000' },
    ];
    mockSWR(banks);

    const { result } = renderHook(() => useBrazilianBanks());

    expect(result.current.banks).toEqual(banks);
    expect(result.current.error).toBeNull();
  });

  it('surfaces malformed bank-list payload while keeping the explicit static fallback visible', () => {
    mockSWR({ banks: [] });

    const { result } = renderHook(() => useBrazilianBanks());

    expect(result.current.banks.length).toBeGreaterThan(0);
    expect(result.current.error).toBe('Lista de bancos inválida');
  });

  it('surfaces empty bank-list payload while keeping the explicit static fallback visible', () => {
    mockSWR([]);

    const { result } = renderHook(() => useBrazilianBanks());

    expect(result.current.banks.length).toBeGreaterThan(0);
    expect(result.current.error).toBe('Lista de bancos vazia');
  });

  it('keeps the explicit static fallback visible when the backend lookup fails', () => {
    mockSWR(undefined, false, new Error('Lista de bancos indisponivel'));

    const { result } = renderHook(() => useBrazilianBanks());

    expect(result.current.banks.length).toBeGreaterThan(0);
    expect(result.current.error).toBe('Lista de bancos indisponivel');
  });
});
