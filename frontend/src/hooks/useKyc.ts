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
  /** Rejection reason property. */
  rejectedReason?: string | null;
  /** Reviewed at property. */
  reviewedAt?: string | null;
  /** File URL property. */
  fileUrl?: string | null;
  /** File size property. */
  fileSize?: number | null;
  /** MIME type property. */
  mimeType?: string | null;
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

export interface KycMfaState {
  enabled: boolean;
  pendingSetup: boolean;
}

export interface KycAuthSession {
  id: string;
  createdAt: string;
  expiresAt: string;
}

export interface KycSecurityState {
  mfa: KycMfaState;
  sessions?: KycAuthSession[];
}

type ApiObjectEnvelope<T> = { data?: T };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isOptionalNullableString(value: unknown): value is string | null | undefined {
  return value === null || value === undefined || typeof value === 'string';
}

function isOptionalNullableNumber(value: unknown): value is number | null | undefined {
  return value === null || value === undefined || (typeof value === 'number' && Number.isFinite(value));
}

function isKycDocument(value: unknown): value is KycDocument {
  const record = asRecord(value);
  return (
    record !== null &&
    typeof record.id === 'string' &&
    typeof record.type === 'string' &&
    isOptionalNullableString(record.fileName) &&
    isOptionalNullableString(record.originalName) &&
    isOptionalNullableString(record.status) &&
    isOptionalNullableString(record.rejectedReason) &&
    isOptionalNullableString(record.reviewedAt) &&
    isOptionalNullableString(record.fileUrl) &&
    isOptionalNullableNumber(record.fileSize) &&
    isOptionalNullableString(record.mimeType) &&
    isOptionalNullableString(record.createdAt)
  );
}

function isKycBankAccount(value: unknown): value is KycBankAccount {
  const record = asRecord(value);
  return (
    record !== null &&
    isOptionalNullableString(record.bankName) &&
    isOptionalNullableString(record.bankCode) &&
    isOptionalNullableString(record.agency) &&
    isOptionalNullableString(record.account) &&
    isOptionalNullableString(record.accountType) &&
    isOptionalNullableString(record.pixKey) &&
    isOptionalNullableString(record.pixKeyType) &&
    isOptionalNullableString(record.holderName) &&
    isOptionalNullableString(record.holderDocument)
  );
}
function isKycAuthSession(value: unknown): value is KycAuthSession {
  const record = asRecord(value);
  return (
    record !== null &&
    typeof record.id === 'string' &&
    typeof record.createdAt === 'string' &&
    typeof record.expiresAt === 'string'
  );
}


function normalizeKycCompletionPayload(value: unknown): KycCompletion | null {
  const envelope = asRecord(value);
  const payload = asRecord(envelope?.data) ?? envelope;
  if (!payload) {
    return null;
  }

  const sections = (Array.isArray(payload.sections) ? payload.sections : [])
    .map((section) => asRecord(section))
    .filter((section): section is Record<string, unknown> => section !== null)
    .map((section) => ({
      name: String(section.name || ''),
      complete: Boolean(section.complete),
    }))
    .filter((section) => section.name.length > 0);
  const rawPercentage =
    payload.percentage ?? payload.completion ?? (payload.completed === true ? 100 : 0);
  const numericPercentage = Number(rawPercentage);
  const percentage = Number.isFinite(numericPercentage)
    ? Math.min(100, Math.max(0, numericPercentage))
    : 0;

  return { percentage, sections };
}

// ═══ PROFILE ═══

export function useProfile() {
  const { data, error, isLoading, mutate } = useSWR<KycProfile | null>('/kyc/profile', swrFetcher);
  const profileRecord = asRecord(data);
  const profile = data === null || data === undefined ? null : profileRecord;
  const payloadError = data === undefined || data === null || profileRecord
    ? undefined
    : new Error('Invalid KYC profile payload');

  return {
    profile,
    isLoading,
    error: error ?? payloadError,
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
  const { data, error, isLoading, mutate } = useSWR<KycFiscal | null>('/kyc/fiscal', swrFetcher);
  const fiscalRecord = asRecord(data);
  const fiscal = data === null || data === undefined ? null : fiscalRecord;
  const payloadError = data === undefined || data === null || fiscalRecord
    ? undefined
    : new Error('Invalid KYC fiscal payload');

  return {
    fiscal,
    isLoading,
    error: error ?? payloadError,
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
  const hasDocumentPayload = data !== undefined && Array.isArray(data);
  const hasValidDocuments = hasDocumentPayload && data.every(isKycDocument);
  const documents = hasValidDocuments ? data : [];
  const payloadError = data === undefined || hasValidDocuments
    ? undefined
    : new Error('Invalid KYC documents payload');

  return {
    documents,
    isLoading,
    error: error ?? payloadError,
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
  const bankAccount = isKycBankAccount(data) ? data : null;
  const payloadError = data === undefined || data === null || bankAccount
    ? undefined
    : new Error('Invalid KYC bank payload');

  return {
    bankAccount,
    isLoading,
    error: error ?? payloadError,
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

export function useSecurityState() {
  const { data, error, isLoading, mutate } = useSWR<KycSecurityState>(
    '/kyc/security',
    swrFetcher,
  );
  const payload = asRecord(data);
  const mfa = asRecord(payload?.mfa);
  const sessions = payload?.sessions;
  const hasValidMfa = Boolean(
    mfa &&
      typeof mfa.enabled === 'boolean' &&
      typeof mfa.pendingSetup === 'boolean',
  );
  const hasValidSessions = sessions === undefined || (Array.isArray(sessions) && sessions.every(isKycAuthSession));
  const isSecurityPayload = hasValidMfa && hasValidSessions;
  const security = isSecurityPayload ? (data as KycSecurityState) : null;
  const payloadError = data === undefined || data === null || isSecurityPayload
    ? undefined
    : hasValidMfa
      ? new Error('Invalid KYC security sessions payload')
      : new Error('Invalid KYC security payload');

  return {
    security,
    isLoading,
    error: error ?? payloadError,
    mutate,
  };
}

export function useSecurityMutations() {
  return {
    changePassword: (currentPassword: string, newPassword: string) =>
      kycApi.changePassword(currentPassword, newPassword),
    startMfaSetup: () => kycApi.startMfaSetup(),
    verifyMfaSetup: (code: string) => kycApi.verifyMfaSetup(code),
    disableMfa: (code?: string) => kycApi.disableMfa(code),
    revokeSession: (sessionId: string) => kycApi.revokeSecuritySession(sessionId),
  };
}

// ═══ KYC STATUS & COMPLETION ═══

export function useKycStatus() {
  const { data, error, isLoading, mutate } = useSWR<KycStatus>('/kyc/status', swrFetcher, {
    dedupingInterval: 60000,
    revalidateOnFocus: false,
  });
  const statusRecord = asRecord(data);
  const isStatusPayload = Boolean(statusRecord && typeof statusRecord.kycStatus === 'string');
  const status = isStatusPayload ? (data as KycStatus) : null;
  const payloadError = data === undefined || data === null || isStatusPayload
    ? undefined
    : new Error('Invalid KYC status payload');

  return {
    status,
    isLoading,
    error: error ?? payloadError,
    mutate,
  };
}

/** Use kyc completion. */
export function useKycCompletion() {
  const { data, error, isLoading, mutate } = useSWR<
    KycCompletion | ApiObjectEnvelope<KycCompletion> | Record<string, unknown>
  >('/kyc/completion', swrFetcher, {
    dedupingInterval: 30000,
    revalidateOnFocus: false,
  });
  const envelope = asRecord(data);
  const payload = asRecord(envelope?.data) ?? envelope;
  const hasMalformedSections = Boolean(
    payload &&
      Object.prototype.hasOwnProperty.call(payload, 'sections') &&
      !Array.isArray(payload.sections),
  );
  const payloadError = hasMalformedSections
    ? new Error('Invalid KYC completion sections payload')
    : undefined;
  return {
    completion: payloadError ? null : normalizeKycCompletionPayload(data),
    isLoading,
    error: error ?? payloadError,
    mutate,
  };
}


/** Use kyc submit. */
export function useKycSubmit() {
  return {
    submitKyc: () => kycApi.submitKyc(),
  };
}
