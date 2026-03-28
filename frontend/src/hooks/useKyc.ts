'use client';

import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';
import { kycApi } from '@/lib/api';

// ═══ PROFILE ═══

export function useProfile() {
  const { data, error, isLoading, mutate } = useSWR<any>('/kyc/profile', swrFetcher);
  return {
    profile: data || null,
    isLoading,
    error,
    mutate,
  };
}

export function useProfileMutations() {
  return {
    updateProfile: (data: Record<string, any>) => kycApi.updateProfile(data),
    uploadAvatar: (file: File) => kycApi.uploadAvatar(file),
  };
}

// ═══ FISCAL ═══

export function useFiscalData() {
  const { data, error, isLoading, mutate } = useSWR<any>('/kyc/fiscal', swrFetcher);
  return {
    fiscal: data || null,
    isLoading,
    error,
    mutate,
  };
}

export function useFiscalMutations() {
  return {
    updateFiscal: (data: Record<string, any>) => kycApi.updateFiscalData(data),
  };
}

// ═══ DOCUMENTS ═══

export function useKycDocuments() {
  const { data, error, isLoading, mutate } = useSWR<any>('/kyc/documents', swrFetcher);
  return {
    documents: data || [],
    isLoading,
    error,
    mutate,
  };
}

export function useDocumentMutations() {
  return {
    uploadDocument: (type: string, file: File) => kycApi.uploadDocument(type, file),
    deleteDocument: (docId: string) => kycApi.deleteDocument(docId),
  };
}

// ═══ BANK ═══

export function useBankAccount() {
  const { data, error, isLoading, mutate } = useSWR<any>('/kyc/bank', swrFetcher);
  return {
    bankAccount: data || null,
    isLoading,
    error,
    mutate,
  };
}

export function useBankMutations() {
  return {
    updateBank: (data: Record<string, any>) => kycApi.updateBankAccount(data),
  };
}

// ═══ SECURITY ═══

export function useSecurityMutations() {
  return {
    changePassword: (currentPassword: string, newPassword: string) =>
      kycApi.changePassword(currentPassword, newPassword),
  };
}

// ═══ KYC STATUS & COMPLETION ═══

export function useKycStatus() {
  const { data, error, isLoading, mutate } = useSWR<any>('/kyc/status', swrFetcher, {
    dedupingInterval: 60000,
    revalidateOnFocus: false,
  });
  return {
    status: data || null,
    isLoading,
    error,
    mutate,
  };
}

export function useKycCompletion() {
  const { data, error, isLoading, mutate } = useSWR<any>('/kyc/completion', swrFetcher, {
    dedupingInterval: 30000,
    revalidateOnFocus: false,
  });
  return {
    completion: data || null,
    isLoading,
    error,
    mutate,
  };
}

export function useKycSubmit() {
  return {
    submitKyc: () => kycApi.submitKyc(),
  };
}
