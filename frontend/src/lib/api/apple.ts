import { apiFetch } from './core';

export interface AppleDiagnosticResponse {
  configured: boolean;
  lastProbe: {
    at: string;
    result: string;
    error?: string;
  } | null;
  configuredVars: string[];
  missingVars: string[];
}

export async function getAppleDiagnostic(): Promise<AppleDiagnosticResponse> {
  const res = await apiFetch<AppleDiagnosticResponse>('/auth/apple/diagnostic');
  if (res.error) {
    throw new Error(res.error);
  }
  return res.data as AppleDiagnosticResponse;
}
