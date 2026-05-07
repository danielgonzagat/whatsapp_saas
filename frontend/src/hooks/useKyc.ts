'use client';

import { kycApi } from '@/lib/api';
import { swrFetcher } from '@/lib/fetcher';
import useSWR from 'swr';

/** Kyc document status type. */
export type KycDocumentStatus = 'pending' | 'approved' | 'rejected' | 'review';

/** Kyc document shape. */
export interface KycDocument {
  /** Id property. */
  id: string;
  /** Type property. */
  type: string;
  /** File name property. */
  fileName?: string | null;
  /** Original name property. */
  originalName?: string | null;
  /** Status property. */
  status?: KycDocumentStatus | string | null;
  /** Created at property. */
  createdAt?: string | null;
}

/** Kyc bank account shape. */
export interface KycBankAccount {
  /** Bank name property. */
  bankName?: string | null;
  /** Bank code property. */
  bankCode?: string | null;
  /** Agency property. */
  agency?: string | null;
  /** Account property. */
  account?: string | null;
  /** Account type property. */
  accountType?: string | null;
  /** Pix key property. */
  pixKey?: string | null;
  /** Pix key type property. */
  pixKeyType?: string | null;
  /** Holder name property. */
  holderName?: string | null;
  /** Holder document property. */
  holderDocument?: string | null;
}

/** Kyc completion section shape. */
export interface KycCompletionSection {
  /** Name property. */
  name: string;
  /** Complete property. */
  complete?: boolean;
}

/** Kyc completion shape. */
export interface KycCompletion {
  /** Percentage property. */
  percentage: number;
  /** Sections property. */
  sections?: KycCompletionSection[];
}

/** Kyc profile type. */
export type KycProfile = Record<string, unknown>;
/** Kyc fiscal type. */
export type KycFiscal = Record<string, unknown>;
/** Kyc status shape. */
export interface KycStatus {
  /** Kyc status property. */
  kycStatus?: string;
  [k: string]: unknown;
}
/** Kyc update payload type. */
export type KycUpdatePayload = Record<string, unknown>;

// ═══ PROFILE ═══

export function useProfile() {
  const { data, error, isLoading, mutate } = useSWR<KycProfile>('/kyc/profile', swrFetcher);
  return {
    profile: data || null,
    isLoading,
    error,
    mutate,
  };
}

/** Use profile mutations. */
export function useProfileMutations() {
  return {
    updateProfile: (data: KycUpdatePayload) => kycApi.updateProfile(data),
    uploadAvatar: (file: File) => kycApi.uploadAvatar(file),
  };
}

// ═══ FISCAL ═══

export function useFiscalData() {
  const { data, error, isLoading, mutate } = useSWR<KycFiscal>('/kyc/fiscal', swrFetcher);
  return {
    fiscal: data || null,
    isLoading,
    error,
    mutate,
  };
}

/** Use fiscal mutations. */
export function useFiscalMutations() {
  return {
    updateFiscal: (data: KycUpdatePayload) => kycApi.updateFiscalData(data),
  };
}

// ═══ DOCUMENTS ═══

export function useKycDocuments() {
  const { data, error, isLoading, mutate } = useSWR<KycDocument[]>('/kyc/documents', swrFetcher);
  return {
    documents: data || [],
    isLoading,
    error,
    mutate,
  };
}

/** Use document mutations. */
export function useDocumentMutations() {
  return {
    uploadDocument: (type: string, file: File) => kycApi.uploadDocument(type, file),
    deleteDocument: (docId: string) => kycApi.deleteDocument(docId),
  };
}

// ═══ BANK ═══

export function useBankAccount() {
  const { data, error, isLoading, mutate } = useSWR<KycBankAccount>('/kyc/bank', swrFetcher);
  return {
    bankAccount: data || null,
    isLoading,
    error,
    mutate,
  };
}

/** Use bank mutations. */
export function useBankMutations() {
  return {
    updateBank: (data: KycUpdatePayload) => kycApi.updateBankAccount(data),
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
  const { data, error, isLoading, mutate } = useSWR<KycStatus>('/kyc/status', swrFetcher, {
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

/** Use kyc completion. */
export function useKycCompletion() {
  const { data, error, isLoading, mutate } = useSWR<KycCompletion>('/kyc/completion', swrFetcher, {
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

/** Use kyc submit. */
export function useKycSubmit() {
  return {
    submitKyc: () => kycApi.submitKyc(),
  };
}
