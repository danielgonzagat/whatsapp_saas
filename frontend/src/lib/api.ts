// API Client for KLOEL Backend
// Em client-side usa NEXT_PUBLIC_API_URL, em server-side pode usar BACKEND_URL
const API_BASE = process.env.NEXT_PUBLIC_API_URL || process.env.BACKEND_URL || 'http://localhost:3001';

export interface WalletBalance {
  available: number;
  pending: number;
  blocked: number;
  total: number;
  formattedAvailable: string;
  formattedPending: string;
  formattedTotal: string;
}

export interface WalletTransaction {
  id: string;
  type: 'sale' | 'withdrawal' | 'refund' | 'fee';
  amount: number;
  grossAmount?: number;
  gatewayFee?: number;
  kloelFee?: number;
  netAmount?: number;
  status: 'pending' | 'confirmed' | 'failed';
  description?: string;
  createdAt: string;
}

export interface MemoryItem {
  id: string;
  key: string;
  value: any;
  type: string;
  createdAt: string;
  embedding?: number[];
}

export interface Product {
  name: string;
  price: number;
  description?: string;
  paymentLink?: string;
}

export interface Lead {
  id: string;
  phone: string;
  name?: string;
  email?: string;
  status: string;
  lastIntent?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppConnectionStatus {
  connected: boolean;
  phone?: string;
  pushName?: string;
  qrCode?: string;
}

// Wallet API
export async function getWalletBalance(workspaceId: string): Promise<WalletBalance> {
  const res = await fetch(`${API_BASE}/kloel/wallet/${workspaceId}/balance`);
  if (!res.ok) throw new Error('Failed to fetch balance');
  return res.json();
}

export async function getWalletTransactions(workspaceId: string): Promise<WalletTransaction[]> {
  const res = await fetch(`${API_BASE}/kloel/wallet/${workspaceId}/transactions`);
  if (!res.ok) throw new Error('Failed to fetch transactions');
  const data = await res.json();
  return data.transactions || [];
}

export async function processSale(workspaceId: string, data: { amount: number; productName: string; customerPhone: string }): Promise<any> {
  const res = await fetch(`${API_BASE}/kloel/wallet/${workspaceId}/process-sale`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to process sale');
  return res.json();
}

// Memory API
export async function getMemoryStats(workspaceId: string): Promise<{ totalItems: number; products: number; knowledge: number }> {
  const res = await fetch(`${API_BASE}/kloel/memory/${workspaceId}/stats`);
  if (!res.ok) throw new Error('Failed to fetch memory stats');
  return res.json();
}

export async function getMemoryList(workspaceId: string): Promise<MemoryItem[]> {
  const res = await fetch(`${API_BASE}/kloel/memory/${workspaceId}/list`);
  if (!res.ok) throw new Error('Failed to fetch memories');
  const data = await res.json();
  return data.memories || [];
}

export async function saveProduct(workspaceId: string, product: Product): Promise<any> {
  const res = await fetch(`${API_BASE}/kloel/memory/${workspaceId}/product`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(product),
  });
  if (!res.ok) throw new Error('Failed to save product');
  return res.json();
}

export async function searchMemory(workspaceId: string, query: string): Promise<MemoryItem[]> {
  const res = await fetch(`${API_BASE}/kloel/memory/${workspaceId}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error('Failed to search memory');
  const data = await res.json();
  return data.memories || [];
}

// WhatsApp Connection API
export async function getWhatsAppStatus(workspaceId: string): Promise<WhatsAppConnectionStatus> {
  const res = await fetch(`${API_BASE}/kloel/whatsapp/connection/${workspaceId}/status`);
  if (!res.ok) throw new Error('Failed to fetch WhatsApp status');
  return res.json();
}

export async function initiateWhatsAppConnection(workspaceId: string): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API_BASE}/kloel/whatsapp/connection/${workspaceId}/initiate`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to initiate WhatsApp connection');
  return res.json();
}

export async function getWhatsAppQR(workspaceId: string): Promise<{ qrCode: string | null; connected: boolean }> {
  const res = await fetch(`${API_BASE}/kloel/whatsapp/connection/${workspaceId}/qr`);
  if (!res.ok) throw new Error('Failed to fetch QR code');
  return res.json();
}

export async function disconnectWhatsApp(workspaceId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/kloel/whatsapp/connection/${workspaceId}/disconnect`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to disconnect WhatsApp');
  return res.json();
}

// Leads API (using existing backend)
export async function getLeads(workspaceId: string): Promise<Lead[]> {
  const res = await fetch(`${API_BASE}/kloel/leads/${workspaceId}`);
  if (!res.ok) return [];
  return res.json();
}

// KLOEL Health
export interface KloelHealth {
  status: 'online' | 'offline';
  identity: string;
}

export async function getKloelHealth(): Promise<KloelHealth> {
  const res = await fetch(`${API_BASE}/kloel/health`);
  if (!res.ok) throw new Error('KLOEL offline');
  const data = await res.json();
  return {
    status: data.status === 'online' ? 'online' : 'offline',
    identity: data.identity || '',
  };
}

// PDF Upload
export async function uploadPdf(workspaceId: string, file: File): Promise<any> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/kloel/pdf/${workspaceId}/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error('Failed to upload PDF');
  return res.json();
}

// Payment Link
export async function createPaymentLink(workspaceId: string, data: { 
  amount: number; 
  productName: string; 
  customerPhone: string;
  customerName?: string;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/kloel/payments/create/${workspaceId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create payment link');
  return res.json();
}

// ============= ASAAS INTEGRATION =============

export interface AsaasStatus {
  connected: boolean;
  environment?: string;
  accountName?: string;
}

export async function getAsaasStatus(workspaceId: string): Promise<AsaasStatus> {
  const res = await fetch(`${API_BASE}/kloel/asaas/${workspaceId}/status`);
  if (!res.ok) throw new Error('Failed to get Asaas status');
  return res.json();
}

export async function connectAsaas(workspaceId: string, apiKey: string, environment: 'sandbox' | 'production' = 'sandbox'): Promise<any> {
  const res = await fetch(`${API_BASE}/kloel/asaas/${workspaceId}/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, environment }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || 'Failed to connect Asaas');
  }
  return res.json();
}

export async function disconnectAsaas(workspaceId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/kloel/asaas/${workspaceId}/disconnect`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to disconnect Asaas');
}

export async function getAsaasBalance(workspaceId: string): Promise<{ balance: number; pending: number; formattedBalance: string; formattedPending: string }> {
  const res = await fetch(`${API_BASE}/kloel/asaas/${workspaceId}/balance`);
  if (!res.ok) throw new Error('Failed to get Asaas balance');
  return res.json();
}

export async function createAsaasPix(workspaceId: string, data: {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  amount: number;
  description: string;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/kloel/asaas/${workspaceId}/pix`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create PIX payment');
  return res.json();
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
  const res = await fetch(`${API_BASE}/kloel/external-payments/${workspaceId}/links`);
  if (!res.ok) throw new Error('Failed to get external payment links');
  return res.json();
}

export async function addExternalPaymentLink(workspaceId: string, data: {
  platform: ExternalPaymentLink['platform'];
  productName: string;
  price: number;
  paymentUrl: string;
  checkoutUrl?: string;
  affiliateUrl?: string;
}): Promise<{ success: boolean; link: ExternalPaymentLink }> {
  const res = await fetch(`${API_BASE}/kloel/external-payments/${workspaceId}/link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to add payment link');
  return res.json();
}

export async function toggleExternalPaymentLink(workspaceId: string, linkId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/kloel/external-payments/${workspaceId}/link/${linkId}/toggle`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to toggle payment link');
  return res.json();
}

export async function deleteExternalPaymentLink(workspaceId: string, linkId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/kloel/external-payments/${workspaceId}/link/${linkId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete payment link');
  return res.json();
}

// Generic API client for more complex use cases
export const api = {
  async get<T = any>(endpoint: string): Promise<{ data: T }> {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
    const res = await fetch(url);
    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(error.message || 'Request failed');
    }
    const data = await res.json();
    return { data };
  },

  async post<T = any>(endpoint: string, body?: any): Promise<{ data: T }> {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(error.message || 'Request failed');
    }
    const data = await res.json();
    return { data };
  },

  async put<T = any>(endpoint: string, body?: any): Promise<{ data: T }> {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(error.message || 'Request failed');
    }
    const data = await res.json();
    return { data };
  },

  async delete<T = any>(endpoint: string): Promise<{ data: T }> {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(error.message || 'Request failed');
    }
    const data = await res.json();
    return { data };
  },
};
