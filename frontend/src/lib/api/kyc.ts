import { apiFetch } from './core';

export async function kycChangePassword(current: string, newPw: string) {
  return apiFetch('/kyc/security/change-password', {
    method: 'POST',
    body: { currentPassword: current, newPassword: newPw },
  });
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
  getKycStatus: () => apiFetch('/kyc/status'),
  getKycCompletion: () => apiFetch('/kyc/completion'),
  submitKyc: () => kycMutation('/kyc/submit', { method: 'POST' }),
};
