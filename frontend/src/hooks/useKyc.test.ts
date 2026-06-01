import { renderHook } from '@testing-library/react';
import useSWR from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('swr', () => ({
  default: vi.fn(() => ({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() })),
}));

vi.mock('@/lib/fetcher', () => ({
  swrFetcher: vi.fn(),
}));

import {
  useBankAccount,
  useFiscalData,
  useKycCompletion,
  useKycDocuments,
  useKycStatus,
  useProfile,
  useSecurityState,
} from './useKyc';

function mockSWR(data: unknown, isLoading = false) {
  vi.mocked(useSWR).mockReturnValue({
    data,
    error: undefined,
    isLoading,
    mutate: vi.fn(),
    isValidating: false,
  });
}

beforeEach(() => {
  vi.mocked(useSWR).mockReset();
});

describe('useProfile', () => {
  it('surfaces malformed profile payload instead of treating it as account data', () => {
    mockSWR([]);

    const { result } = renderHook(() => useProfile());

    expect(result.current.profile).toBeNull();
    expect((result.current.error as Error).message).toBe('Invalid KYC profile payload');
  });
});

describe('useFiscalData', () => {
  it('surfaces malformed fiscal payload instead of treating it as company data', () => {
    mockSWR([]);

    const { result } = renderHook(() => useFiscalData());

    expect(result.current.fiscal).toBeNull();
    expect((result.current.error as Error).message).toBe('Invalid KYC fiscal payload');
  });
});

describe('useKycCompletion', () => {
  it('returns completion sections from the real payload', () => {
    mockSWR({ percentage: 75, sections: [{ name: 'docs', complete: true }] });

    const { result } = renderHook(() => useKycCompletion());

    expect(result.current.completion).toEqual({
      percentage: 75,
      sections: [{ name: 'docs', complete: true }],
    });
    expect(result.current.error).toBeUndefined();
  });

  it('surfaces malformed completion sections instead of a fake empty checklist', () => {
    mockSWR({ percentage: 75, sections: { name: 'docs', complete: true } });

    const { result } = renderHook(() => useKycCompletion());

    expect(result.current.completion).toBeNull();
    expect((result.current.error as Error).message).toBe('Invalid KYC completion sections payload');
  });
});

describe('useKycDocuments', () => {
  it('returns documents from the real array payload', () => {
    mockSWR([{ id: 'doc-1', type: 'cnpj', status: 'pending' }]);

    const { result } = renderHook(() => useKycDocuments());

    expect(result.current.documents).toEqual([{ id: 'doc-1', type: 'cnpj', status: 'pending' }]);
    expect(result.current.error).toBeUndefined();
  });

  it('surfaces malformed document payload instead of a fake empty list', () => {
    mockSWR({ documents: [] });

    const { result } = renderHook(() => useKycDocuments());

    expect(result.current.documents).toEqual([]);
    expect((result.current.error as Error).message).toBe('Invalid KYC documents payload');
  });

  it('surfaces malformed document rows instead of trusting invalid upload status', () => {
    mockSWR([{ id: 42, type: 'cnpj', status: 'pending' }]);

    const { result } = renderHook(() => useKycDocuments());

    expect(result.current.documents).toEqual([]);
    expect((result.current.error as Error).message).toBe('Invalid KYC documents payload');
  });
});

describe('useBankAccount', () => {
  it('returns null while bank account data is loading', () => {
    mockSWR(undefined, true);

    const { result } = renderHook(() => useBankAccount());

    expect(result.current.bankAccount).toBeNull();
    expect(result.current.error).toBeUndefined();
  });

  it('rejects non-object bank payloads instead of treating them as account data', () => {
    mockSWR([]);

    const { result } = renderHook(() => useBankAccount());

    expect(result.current.bankAccount).toBeNull();
    expect((result.current.error as Error).message).toBe('Invalid KYC bank payload');
  });

  it('surfaces malformed bank account fields instead of trusting invalid account data', () => {
    mockSWR({ bankName: 237, bankCode: '237', holderDocument: null });

    const { result } = renderHook(() => useBankAccount());

    expect(result.current.bankAccount).toBeNull();
    expect((result.current.error as Error).message).toBe('Invalid KYC bank payload');
  });
});

describe('useSecurityState', () => {
  it('returns security state from the real MFA payload', () => {
    mockSWR({ mfa: { enabled: true, pendingSetup: false } });

    const { result } = renderHook(() => useSecurityState());

    expect(result.current.security).toEqual({ mfa: { enabled: true, pendingSetup: false } });
    expect(result.current.error).toBeUndefined();
  });

  it('surfaces malformed security payload instead of showing security as unset', () => {
    mockSWR({ mfa: { enabled: true } });

    const { result } = renderHook(() => useSecurityState());

    expect(result.current.security).toBeNull();
    expect((result.current.error as Error).message).toBe('Invalid KYC security payload');
  });
});

describe('useKycStatus', () => {
  it('returns status from the real KYC status payload', () => {
    mockSWR({ kycStatus: 'pending', kycRejectedReason: null });

    const { result } = renderHook(() => useKycStatus());

    expect(result.current.status).toEqual({ kycStatus: 'pending', kycRejectedReason: null });
    expect(result.current.error).toBeUndefined();
  });

  it('surfaces malformed status payload instead of treating it as account status', () => {
    mockSWR({ status: 404 });

    const { result } = renderHook(() => useKycStatus());

    expect(result.current.status).toBeNull();
    expect((result.current.error as Error).message).toBe('Invalid KYC status payload');
  });
});
