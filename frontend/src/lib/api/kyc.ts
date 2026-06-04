import { apiFetch } from './core';

export interface KycCnpjLookupResponse {
  razao_social?: string;
  nome_fantasia?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  qsa?: Array<{ nome_socio?: string; cnpj_cpf_do_socio?: string }>;
}

export interface KycCepLookupResponse {
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
}

export interface KycMfaState {
  enabled: boolean;
  pendingSetup: boolean;
}

export interface KycAuthSession {
  id: string;
  createdAt: string;
  expiresAt: string;
}

export interface KycSecurityResponse {
  mfa: KycMfaState;
  sessions?: KycAuthSession[];
}

export interface KycMfaSetupResponse extends KycSecurityResponse {
  qrDataUrl: string;
  otpauthUrl: string;
}

export async function kycChangePassword(current: string, newPw: string) {
  return apiFetch('/kyc/security/change-password', {
    method: 'POST',
    body: { currentPassword: current, newPassword: newPw },
  });
}

function requireDigits(value: string, label: string, length: number): string {
  const clean = value.replace(/\D/g, '');
  if (clean.length !== length) {
    throw new Error(`${label} invalido`);
  }
  return clean;
}

async function kycMutation<T = unknown>(
  endpoint: string,
  options?: Parameters<typeof apiFetch>[1],
): Promise<T> {
  const res = await apiFetch<T>(endpoint, options);
  if (res.error) {
    throw new Error(res.error);
  }
  return res.data as T;
}

export const kycApi = {
  getProfile: () => apiFetch('/kyc/profile'),
  updateProfile: (data: Record<string, unknown>) =>
    kycMutation('/kyc/profile', { method: 'PUT', body: data }),
  uploadAvatar: async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return kycMutation('/kyc/profile/avatar', { method: 'POST', body: fd });
  },
  getFiscalData: () => apiFetch('/kyc/fiscal'),
  updateFiscalData: (data: Record<string, unknown>) =>
    kycMutation('/kyc/fiscal', { method: 'PUT', body: data }),
  lookupCnpj: async (cnpj: string) =>
    kycMutation<KycCnpjLookupResponse>(`/kyc/lookup/cnpj/${requireDigits(cnpj, 'CNPJ', 14)}`),
  lookupCep: async (cep: string) =>
    kycMutation<KycCepLookupResponse>(`/kyc/lookup/cep/${requireDigits(cep, 'CEP', 8)}`),
  getDocuments: () => apiFetch('/kyc/documents'),
  uploadDocument: async (type: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('type', type);
    return kycMutation('/kyc/documents/upload', { method: 'POST', body: fd });
  },
  deleteDocument: (docId: string) => kycMutation(`/kyc/documents/${docId}`, { method: 'DELETE' }),
  getBankAccount: () => apiFetch('/kyc/bank'),
  updateBankAccount: (data: Record<string, unknown>) =>
    kycMutation('/kyc/bank', { method: 'PUT', body: data }),
  changePassword: (currentPassword: string, newPassword: string) =>
    kycMutation('/kyc/security/change-password', {
      method: 'POST',
      body: { currentPassword, newPassword },
    }),
  getSecurity: () => apiFetch<KycSecurityResponse>('/kyc/security'),
  startMfaSetup: () =>
    kycMutation<KycMfaSetupResponse>('/kyc/security/mfa/setup', { method: 'POST' }),
  verifyMfaSetup: (code: string) =>
    kycMutation<KycSecurityResponse>('/kyc/security/mfa/verify', {
      method: 'POST',
      body: { code },
    }),
  disableMfa: (code?: string) =>
    kycMutation<KycSecurityResponse>('/kyc/security/mfa/disable', {
      method: 'POST',
      body: code ? { code } : {},
    }),
  revokeSecuritySession: (sessionId: string) =>
    kycMutation('/kyc/security/sessions/' + encodeURIComponent(sessionId), { method: 'DELETE' }),
  getKycStatus: () => apiFetch('/kyc/status'),
  getKycCompletion: () => apiFetch('/kyc/completion'),
  submitKyc: () => kycMutation('/kyc/submit', { method: 'POST' }),
};
