// Asaas interfaces and functions, external payment links
import { apiFetch } from './core';

export interface AsaasStatus {
  connected: boolean;
  environment?: string;
  accountName?: string;
}

export interface AsaasBalance {
  balance: number;
  pending: number;
  formattedBalance: string;
  formattedPending: string;
}

export interface AsaasPaymentRecord {
  id: string;
  status: string;
  value?: number;
  description?: string;
  billingType?: string;
  dueDate?: string;
  customer?: string;
  externalReference?: string;
  invoiceUrl?: string;
  pixQrCodeUrl?: string;
  createdAt?: string;
}

export interface SalesReportSummary {
  totalSales: number;
  totalAmount: number;
}

export interface ExternalPaymentPlatformConfig {
  platform: string;
  apiKey?: string;
  webhookSecret?: string;
  enabled: boolean;
}

export interface KnowledgeSourceItem {
  id: string;
  type: 'TEXT' | 'URL' | 'PDF';
  content?: string;
  status?: string;
  createdAt?: string;
}

export interface KnowledgeBaseItem {
  id: string;
  name: string;
  sources?: KnowledgeSourceItem[];
  createdAt?: string;
}

export async function getAsaasStatus(workspaceId: string): Promise<AsaasStatus> {
  const res = await apiFetch<AsaasStatus>(`/kloel/asaas/${workspaceId}/status`);
  if (res.error) throw new Error('Failed to get Asaas status');
  return res.data as AsaasStatus;
}

export async function connectAsaas(workspaceId: string, apiKey: string, environment: 'sandbox' | 'production' = 'sandbox'): Promise<any> {
  const res = await apiFetch<any>(`/kloel/asaas/${workspaceId}/connect`, {
    method: 'POST',
    body: { apiKey, environment },
  });
  if (res.error) throw new Error(res.error || 'Failed to connect Asaas');
  return res.data;
}

export async function disconnectAsaas(workspaceId: string): Promise<void> {
  const res = await apiFetch<any>(`/kloel/asaas/${workspaceId}/disconnect`, {
    method: 'DELETE',
  });
  if (res.error) throw new Error('Failed to disconnect Asaas');
}

export async function getAsaasBalance(workspaceId: string): Promise<{ balance: number; pending: number; formattedBalance: string; formattedPending: string }> {
  const res = await apiFetch<{ balance: number; pending: number; formattedBalance: string; formattedPending: string }>(`/kloel/asaas/${workspaceId}/balance`);
  if (res.error) throw new Error('Failed to get Asaas balance');
  return res.data as { balance: number; pending: number; formattedBalance: string; formattedPending: string };
}

export async function createAsaasPix(workspaceId: string, data: {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  amount: number;
  description: string;
}): Promise<any> {
  const res = await apiFetch<any>(`/kloel/asaas/${workspaceId}/pix`, {
    method: 'POST',
    body: data,
  });
  if (res.error) throw new Error('Failed to create PIX payment');
  return res.data;
}

export async function createAsaasBoleto(workspaceId: string, data: Record<string, unknown>): Promise<any> {
  const res = await apiFetch<any>(`/kloel/asaas/${workspaceId}/boleto`, {
    method: 'POST',
    body: data,
  });
  if (res.error) throw new Error('Failed to create Asaas boleto');
  return res.data;
}

export async function getAsaasPayment(workspaceId: string, paymentId: string): Promise<any> {
  const res = await apiFetch<any>(`/kloel/asaas/${workspaceId}/payment/${encodeURIComponent(paymentId)}`);
  if (res.error) throw new Error('Failed to get Asaas payment');
  return res.data;
}

export async function listAsaasPayments(workspaceId: string): Promise<any> {
  const res = await apiFetch<any>(`/kloel/asaas/${workspaceId}/payments`);
  if (res.error) throw new Error('Failed to list Asaas payments');
  return res.data;
}

// ============= EXTERNAL PAYMENT LINKS =============

export interface ExternalPaymentLink {
  id: string;
  workspaceId: string;
  platform: 'hotmart' | 'kiwify' | 'eduzz' | 'monetizze' | 'braip' | 'other';
  productName: string;
  price: number;
  paymentUrl: string;
  checkoutUrl?: string;
  affiliateUrl?: string;
  isActive: boolean;
  createdAt: string;
}

export interface ExternalPaymentSummary {
  totalLinks: number;
  activeLinks: number;
  byPlatform: Record<string, number>;
  totalValue: number;
}

export async function getExternalPaymentLinks(workspaceId: string): Promise<{ links: ExternalPaymentLink[]; summary: ExternalPaymentSummary }> {
  const res = await apiFetch<{ links: ExternalPaymentLink[]; summary: ExternalPaymentSummary }>(`/kloel/external-payments/${workspaceId}/links`);
  if (res.error) throw new Error('Failed to get external payment links');
  return res.data as { links: ExternalPaymentLink[]; summary: ExternalPaymentSummary };
}

export async function addExternalPaymentLink(workspaceId: string, data: {
  platform: ExternalPaymentLink['platform'];
  productName: string;
  price: number;
  paymentUrl: string;
  checkoutUrl?: string;
  affiliateUrl?: string;
}): Promise<{ success: boolean; link: ExternalPaymentLink }> {
  const res = await apiFetch<{ success: boolean; link: ExternalPaymentLink }>(`/kloel/external-payments/${workspaceId}/link`, {
    method: 'POST',
    body: data,
  });
  if (res.error) throw new Error('Failed to add payment link');
  return res.data as { success: boolean; link: ExternalPaymentLink };
}

export async function toggleExternalPaymentLink(workspaceId: string, linkId: string): Promise<any> {
  const res = await apiFetch<any>(`/kloel/external-payments/${workspaceId}/link/${linkId}/toggle`, {
    method: 'POST',
  });
  if (res.error) throw new Error('Failed to toggle payment link');
  return res.data;
}

export async function deleteExternalPaymentLink(workspaceId: string, linkId: string): Promise<any> {
  const res = await apiFetch<any>(`/kloel/external-payments/${workspaceId}/link/${linkId}`, {
    method: 'DELETE',
  });
  if (res.error) throw new Error('Failed to delete payment link');
  return res.data;
}

export async function searchExternalPayments(workspaceId: string, query: string): Promise<any> {
  const res = await apiFetch<any>(`/kloel/external-payments/${workspaceId}/search?q=${encodeURIComponent(query)}`);
  if (res.error) throw new Error('Failed to search external payments');
  return res.data;
}

export async function listExternalPlatforms(workspaceId: string): Promise<any> {
  const res = await apiFetch<any>(`/kloel/external-payments/${workspaceId}/platforms`);
  if (res.error) throw new Error('Failed to list external platforms');
  return res.data;
}

export async function createExternalPlatform(workspaceId: string, platform: Record<string, unknown>): Promise<any> {
  const res = await apiFetch<any>(`/kloel/external-payments/${workspaceId}/platform`, {
    method: 'POST',
    body: platform,
  });
  if (res.error) throw new Error('Failed to create external platform');
  return res.data;
}
