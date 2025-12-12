// API Client for KLOEL Backend
// Em client-side usa NEXT_PUBLIC_API_URL, em server-side pode usar BACKEND_URL
import { API_BASE, apiUrl } from './http';

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
  lastInteraction?: string;
  totalMessages?: number;
  metadata?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export interface WhatsAppConnectionStatus {
  connected: boolean;
  status?: string;
  phone?: string;
  pushName?: string;
  qrCode?: string;
  message?: string;
}

export interface WhatsAppConnectResponse {
  status: string;
  message?: string;
  qrCode?: string;
  qrCodeImage?: string;
  error?: boolean;
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
  const res = await fetch(apiUrl(`/kloel/whatsapp/connection/${workspaceId}/status`), {
    credentials: 'include',
  });

  if (!res.ok) throw new Error('Failed to fetch WhatsApp status');

  const data = await res.json();
  const connected = data.connected === true || data.status === 'connected';

  return {
    connected,
    status: data.status,
    phone: data.phone || data.phoneNumber || undefined,
    pushName: data.pushName || data.businessName || undefined,
    qrCode: data.qrCode || data.qrCodeImage || null,
    message: data.message,
  };
}

export async function initiateWhatsAppConnection(workspaceId: string): Promise<WhatsAppConnectResponse> {
  const res = await fetch(apiUrl(`/kloel/whatsapp/connection/${workspaceId}/initiate`), {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to initiate WhatsApp connection');
  return res.json();
}

export async function getWhatsAppQR(workspaceId: string): Promise<{ qrCode: string | null; connected: boolean; status?: string; message?: string }> {
  const res = await fetch(apiUrl(`/kloel/whatsapp/connection/${workspaceId}/qr`), {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch QR code');
  const data = await res.json();
  return {
    qrCode: data.qrCodeImage || data.qrCode || null,
    connected: data.connected === true || data.status === 'connected',
    status: data.status,
    message: data.message,
  };
}

export async function disconnectWhatsApp(workspaceId: string): Promise<any> {
  const res = await fetch(apiUrl(`/kloel/whatsapp/connection/${workspaceId}/disconnect`), {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to disconnect WhatsApp');
  return res.json();
}

// Leads API (using existing backend)
export async function getLeads(
  workspaceId: string,
  params?: { status?: string; search?: string; limit?: number },
): Promise<Lead[]> {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.search) query.set('q', params.search);
  if (params?.limit) query.set('limit', String(params.limit));

  const url = `${API_BASE}/kloel/leads/${workspaceId}${query.toString() ? `?${query.toString()}` : ''}`;

  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    throw new Error('Failed to fetch leads');
  }
  const data = await res.json();
  if (Array.isArray(data)) return data;
  if (Array.isArray((data as any)?.leads)) return (data as any).leads;
  return [];
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
export interface PaymentLinkResponse {
  success: boolean;
  paymentLink?: string;
  payment: {
    id: string;
    invoiceUrl?: string;
    pixQrCodeUrl?: string;
    pixCopyPaste?: string;
    paymentLink?: string;
    status: string;
  };
}

export async function createPaymentLink(workspaceId: string, data: { 
  amount: number; 
  productName: string; 
  customerPhone: string;
  customerName?: string;
  leadId?: string;
}): Promise<PaymentLinkResponse> {
  const res = await fetch(`${API_BASE}/kloel/payments/create/${workspaceId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...data,
      description: data.productName,
    }),
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

// ============= AUTOPILOT =============

export type AutopilotStatus = Record<string, any>;
export type AutopilotStats = Record<string, any>;
export type AutopilotImpact = Record<string, any>;
export interface AutopilotConfig {
  conversionFlowId?: string | null;
  currencyDefault?: string;
  recoveryTemplateName?: string | null;
  [key: string]: any;
}

export interface AutopilotAction {
  createdAt: string;
  contactId?: string;
  contact?: string;
  intent?: string;
  action?: string;
  status?: string;
  reason?: string;
}

const buildQuery = (params: Record<string, string | number | undefined | null>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    search.append(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
};

const authHeaders = (token?: string): Record<string, string> =>
  token ? { authorization: `Bearer ${token}` } : {};

export async function getAutopilotStatus(workspaceId: string, token?: string): Promise<AutopilotStatus> {
  const res = await fetch(`${API_BASE}/autopilot/status${buildQuery({ workspaceId })}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error('Failed to fetch autopilot status');
  return res.json();
}

export async function toggleAutopilot(workspaceId: string, enabled: boolean, token?: string): Promise<AutopilotStatus> {
  const res = await fetch(`${API_BASE}/autopilot/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ workspaceId, enabled }),
  });
  if (!res.ok) throw new Error('Failed to toggle autopilot');
  return res.json();
}

export async function getAutopilotConfig(workspaceId: string, token?: string): Promise<AutopilotConfig> {
  const res = await fetch(`${API_BASE}/autopilot/config${buildQuery({ workspaceId })}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error('Failed to fetch autopilot config');
  return res.json();
}

export async function updateAutopilotConfig(workspaceId: string, config: AutopilotConfig, token?: string): Promise<any> {
  const res = await fetch(`${API_BASE}/autopilot/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ workspaceId, ...config }),
  });
  if (!res.ok) throw new Error('Failed to update autopilot config');
  return res.json();
}

export async function getAutopilotStats(workspaceId: string, token?: string): Promise<AutopilotStats> {
  const res = await fetch(`${API_BASE}/autopilot/stats${buildQuery({ workspaceId })}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error('Failed to fetch autopilot stats');
  return res.json();
}

export async function getAutopilotImpact(workspaceId: string, token?: string): Promise<AutopilotImpact> {
  const res = await fetch(`${API_BASE}/autopilot/impact${buildQuery({ workspaceId })}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error('Failed to fetch autopilot impact');
  return res.json();
}

export async function getAutopilotActions(
  workspaceId: string,
  options?: { limit?: number; status?: string; token?: string },
): Promise<AutopilotAction[]> {
  const res = await fetch(
    `${API_BASE}/autopilot/actions${buildQuery({
      workspaceId,
      limit: options?.limit,
      status: options?.status,
    })}`,
    {
      headers: authHeaders(options?.token),
    },
  );
  if (!res.ok) throw new Error('Failed to fetch autopilot actions');
  return res.json();
}

export async function exportAutopilotActions(workspaceId: string, status?: string, token?: string): Promise<string> {
  const res = await fetch(`${API_BASE}/autopilot/actions/export${buildQuery({ workspaceId, status })}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error('Failed to export autopilot actions');
  return res.text();
}

export async function retryAutopilotContact(workspaceId: string, contactId: string, token?: string): Promise<any> {
  const res = await fetch(`${API_BASE}/autopilot/retry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ workspaceId, contactId }),
  });
  if (!res.ok) throw new Error('Failed to retry autopilot contact');
  return res.json();
}

export async function markAutopilotConversion(params: {
  workspaceId: string;
  contactId?: string;
  phone?: string;
  reason?: string;
  meta?: Record<string, any>;
  token?: string;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/autopilot/conversion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(params.token) },
    body: JSON.stringify({
      workspaceId: params.workspaceId,
      contactId: params.contactId,
      phone: params.phone,
      reason: params.reason,
      meta: params.meta,
    }),
  });
  if (!res.ok) throw new Error('Failed to mark conversion');
  return res.json();
}

export async function runAutopilot(params: {
  workspaceId: string;
  phone?: string;
  contactId?: string;
  message?: string;
  forceLocal?: boolean;
  token?: string;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/autopilot/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(params.token) },
    body: JSON.stringify({
      workspaceId: params.workspaceId,
      phone: params.phone,
      contactId: params.contactId,
      message: params.message,
      forceLocal: params.forceLocal,
    }),
  });
  if (!res.ok) throw new Error('Failed to run autopilot');
  return res.json();
}

// ============= CAMPAIGNS =============

export interface Campaign {
  id: string;
  name?: string;
  status?: string;
  createdAt?: string;
  [key: string]: any;
}

export async function createCampaign(workspaceId: string, data: Record<string, any>): Promise<Campaign> {
  const res = await fetch(`${API_BASE}/campaigns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId, ...data }),
  });
  if (!res.ok) throw new Error('Failed to create campaign');
  return res.json();
}

export async function listCampaigns(workspaceId: string): Promise<Campaign[]> {
  const res = await fetch(`${API_BASE}/campaigns${buildQuery({ workspaceId })}`);
  if (!res.ok) throw new Error('Failed to list campaigns');
  return res.json();
}

export async function getCampaign(workspaceId: string, id: string): Promise<Campaign> {
  const res = await fetch(`${API_BASE}/campaigns/${id}${buildQuery({ workspaceId })}`);
  if (!res.ok) throw new Error('Failed to fetch campaign');
  return res.json();
}

export async function launchCampaign(workspaceId: string, id: string, smartTime = false): Promise<any> {
  const res = await fetch(`${API_BASE}/campaigns/${id}/launch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId, smartTime }),
  });
  if (!res.ok) throw new Error('Failed to launch campaign');
  return res.json();
}

export async function createCampaignVariants(workspaceId: string, id: string, variants = 3): Promise<any> {
  const res = await fetch(`${API_BASE}/campaigns/${id}/darwin/variants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId, variants }),
  });
  if (!res.ok) throw new Error('Failed to create variants');
  return res.json();
}

export async function evaluateCampaignDarwin(workspaceId: string, id: string): Promise<any> {
  const res = await fetch(`${API_BASE}/campaigns/${id}/darwin/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId }),
  });
  if (!res.ok) throw new Error('Failed to evaluate variants');
  return res.json();
}

// ============= FLOWS =============

export interface FlowNode {
  id: string;
  type?: string;
  data?: Record<string, any>;
  [key: string]: any;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  [key: string]: any;
}

export interface Flow {
  id: string;
  name?: string;
  nodes?: FlowNode[];
  edges?: FlowEdge[];
  [key: string]: any;
}

export interface FlowExecutionLog {
  createdAt: string;
  logs: any[];
}

export async function getFlowTemplates(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/flows/templates`);
  if (!res.ok) throw new Error('Failed to fetch flow templates');
  return res.json();
}

export async function runFlow(body: { workspaceId: string; flow: Flow; startNode: string; user: string; flowId?: string }): Promise<any> {
  const res = await fetch(`${API_BASE}/flows/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Failed to run flow');
  return res.json();
}

export async function runSavedFlow(
  workspaceId: string,
  flowId: string,
  body: { startNode: string; user: string; flow?: Flow },
): Promise<any> {
  const res = await fetch(`${API_BASE}/flows/${workspaceId}/${flowId}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Failed to run saved flow');
  return res.json();
}

export async function saveFlow(workspaceId: string, flowId: string, flow: Flow): Promise<any> {
  const res = await fetch(`${API_BASE}/flows/save/${workspaceId}/${flowId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(flow),
  });
  if (!res.ok) throw new Error('Failed to save flow');
  return res.json();
}

export async function updateFlow(workspaceId: string, flowId: string, flow: Flow): Promise<any> {
  const res = await fetch(`${API_BASE}/flows/${workspaceId}/${flowId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(flow),
  });
  if (!res.ok) throw new Error('Failed to update flow');
  return res.json();
}

export async function createFlowVersion(
  workspaceId: string,
  flowId: string,
  payload: { nodes: FlowNode[]; edges: FlowEdge[]; label?: string },
): Promise<any> {
  const res = await fetch(`${API_BASE}/flows/version/${workspaceId}/${flowId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to create flow version');
  return res.json();
}

export async function logFlowExecution(workspaceId: string, flowId: string, logs: any[], user?: string): Promise<any> {
  const res = await fetch(`${API_BASE}/flows/log/${workspaceId}/${flowId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ logs, user }),
  });
  if (!res.ok) throw new Error('Failed to log flow execution');
  return res.json();
}

export async function getFlowLogs(workspaceId: string, flowId: string): Promise<FlowExecutionLog[]> {
  const res = await fetch(`${API_BASE}/flows/log/${workspaceId}/${flowId}`);
  if (!res.ok) throw new Error('Failed to fetch flow logs');
  return res.json();
}

export async function listFlows(workspaceId: string): Promise<Flow[]> {
  const res = await fetch(`${API_BASE}/flows/${workspaceId}`);
  if (!res.ok) throw new Error('Failed to list flows');
  return res.json();
}

export async function getFlow(workspaceId: string, flowId: string): Promise<Flow> {
  const res = await fetch(`${API_BASE}/flows/${workspaceId}/${flowId}`);
  if (!res.ok) throw new Error('Failed to fetch flow');
  return res.json();
}

export async function listFlowExecutions(workspaceId: string, limit = 50): Promise<any[]> {
  const res = await fetch(`${API_BASE}/flows/${workspaceId}/executions${buildQuery({ limit })}`);
  if (!res.ok) throw new Error('Failed to list executions');
  return res.json();
}

export async function getFlowExecution(executionId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/flows/execution/${executionId}`);
  if (!res.ok) throw new Error('Failed to fetch execution');
  return res.json();
}

export async function retryFlowExecution(executionId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/flows/execution/${executionId}/retry`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to retry execution');
  return res.json();
}

export async function listFlowVersions(workspaceId: string, flowId: string): Promise<any[]> {
  const res = await fetch(`${API_BASE}/flows/${workspaceId}/${flowId}/versions`);
  if (!res.ok) throw new Error('Failed to list flow versions');
  return res.json();
}

export async function getFlowVersion(workspaceId: string, flowId: string, versionId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/flows/${workspaceId}/${flowId}/versions/${versionId}`);
  if (!res.ok) throw new Error('Failed to fetch flow version');
  return res.json();
}

export async function createFlowFromTemplate(
  workspaceId: string,
  templateId: string,
  payload: { flowId?: string; name?: string },
): Promise<any> {
  const res = await fetch(`${API_BASE}/flows/${workspaceId}/from-template/${templateId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to create flow from template');
  return res.json();
}

// ============= INBOX =============

export interface Conversation {
  id: string;
  contactId?: string;
  status?: string;
  lastMessageAt?: string;
  [key: string]: any;
}

export interface Message {
  id: string;
  from?: string;
  to?: string;
  body?: string;
  createdAt?: string;
  [key: string]: any;
}

export async function listConversations(workspaceId: string): Promise<Conversation[]> {
  const res = await fetch(`${API_BASE}/inbox/${workspaceId}/conversations`);
  if (!res.ok) throw new Error('Failed to list conversations');
  return res.json();
}

export async function getConversationMessages(conversationId: string): Promise<Message[]> {
  const res = await fetch(`${API_BASE}/inbox/conversations/${conversationId}/messages`);
  if (!res.ok) throw new Error('Failed to fetch messages');
  return res.json();
}

export async function closeConversation(conversationId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/inbox/conversations/${conversationId}/close`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to close conversation');
  return res.json();
}

export async function assignConversation(conversationId: string, agentId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/inbox/conversations/${conversationId}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId }),
  });
  if (!res.ok) throw new Error('Failed to assign conversation');
  return res.json();
}

// ============= NOTIFICATIONS =============

export async function registerNotificationDevice(token: string, platform: string): Promise<any> {
  const res = await fetch(`${API_BASE}/notifications/register-device`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, platform }),
  });
  if (!res.ok) throw new Error('Failed to register device');
  return res.json();
}

// ============= METRICS =============

export async function getMetrics(token?: string): Promise<string> {
  const headers: Record<string, string> = {};
  if (token) headers['authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/metrics`, { headers });
  if (!res.ok) throw new Error('Failed to fetch metrics');
  return res.text();
}

export async function getQueueMetrics(token?: string): Promise<any> {
  const headers: Record<string, string> = {};
  if (token) headers['authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/metrics/queues`, { headers });
  if (!res.ok) throw new Error('Failed to fetch queue metrics');
  return res.json();
}

// ============= WHATSAPP =============

export interface WhatsappTemplate {
  name: string;
  language: string;
  components?: any[];
  [key: string]: any;
}

export async function connectWhatsapp(workspaceId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/whatsapp/${workspaceId}/connect`);
  if (!res.ok) throw new Error('Failed to connect WhatsApp');
  return res.json();
}

export async function sendWhatsappMessage(params: {
  workspaceId: string;
  to: string;
  message: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  caption?: string;
}): Promise<any> {
  const { workspaceId, ...body } = params;
  const res = await fetch(`${API_BASE}/whatsapp/${workspaceId}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Failed to send WhatsApp message');
  return res.json();
}

export async function sendWhatsappTemplate(params: {
  workspaceId: string;
  to: string;
  templateName: string;
  language: string;
  components?: any[];
}): Promise<any> {
  const { workspaceId, ...body } = params;
  const res = await fetch(`${API_BASE}/whatsapp/${workspaceId}/send-template`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Failed to send WhatsApp template');
  return res.json();
}

export async function listWhatsappTemplates(workspaceId: string): Promise<WhatsappTemplate[]> {
  const res = await fetch(`${API_BASE}/whatsapp/${workspaceId}/templates`);
  if (!res.ok) throw new Error('Failed to list WhatsApp templates');
  return res.json();
}

export async function whatsappOptIn(workspaceId: string, phone: string): Promise<any> {
  const res = await fetch(`${API_BASE}/whatsapp/${workspaceId}/opt-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  if (!res.ok) throw new Error('Failed to opt-in');
  return res.json();
}

export async function whatsappOptOut(workspaceId: string, phone: string): Promise<any> {
  const res = await fetch(`${API_BASE}/whatsapp/${workspaceId}/opt-out`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  if (!res.ok) throw new Error('Failed to opt-out');
  return res.json();
}

export async function whatsappOptStatus(workspaceId: string, phone: string): Promise<any> {
  const res = await fetch(`${API_BASE}/whatsapp/${workspaceId}/opt-status/${encodeURIComponent(phone)}`);
  if (!res.ok) throw new Error('Failed to get opt status');
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

// ============================================
// Account & Settings API
// ============================================

export interface WorkspaceSettings {
  name?: string;
  phone?: string;
  timezone?: string;
  webhookUrl?: string;
  notifications?: {
    email?: boolean;
    whatsapp?: boolean;
    newLead?: boolean;
    newSale?: boolean;
    lowBalance?: boolean;
  };
}

export async function saveWorkspaceSettings(
  workspaceId: string,
  settings: WorkspaceSettings,
  token?: string
): Promise<any> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`${API_BASE}/workspace/${workspaceId}/account`, {
    method: 'POST',
    headers,
    body: JSON.stringify(settings),
    credentials: 'include',
  });
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || 'Failed to save settings');
  }
  
  return res.json();
}

export interface ApiKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  lastUsedAt?: string;
}

export async function listApiKeys(token?: string): Promise<ApiKey[]> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`${API_BASE}/settings/api-keys`, { headers });
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || 'Failed to list API keys');
  }
  
  return res.json();
}

export async function createApiKey(name: string, token?: string): Promise<ApiKey> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`${API_BASE}/settings/api-keys`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name }),
  });
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || 'Failed to create API key');
  }
  
  return res.json();
}

export async function deleteApiKey(keyId: string, token?: string): Promise<void> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`${API_BASE}/settings/api-keys/${keyId}`, {
    method: 'DELETE',
    headers,
  });
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || 'Failed to delete API key');
  }
}

// ============================================
// Billing & Subscription API
// ============================================

export interface CheckoutResponse {
  url: string;
  sessionId?: string;
}

export async function createCheckoutSession(
  workspaceId: string,
  plan: string,
  email: string,
  token?: string
): Promise<CheckoutResponse> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`${API_BASE}/billing/checkout`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ workspaceId, plan, email }),
  });
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || 'Failed to create checkout session');
  }
  
  return res.json();
}

export interface SubscriptionStatus {
  plan: string;
  status: 'ACTIVE' | 'CANCELED' | 'PAST_DUE' | 'TRIAL';
  currentPeriodEnd?: string;
}

export async function getSubscriptionStatus(
  token?: string
): Promise<any> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`${API_BASE}/billing/status`, {
    headers,
  });
  
  if (!res.ok) {
    return null;
  }
  
  return res.json();
}

// ============================================
// Payment Methods API (Stripe)
// ============================================

export interface PaymentMethod {
  id: string;
  type?: string;
  card: {
    brand: string;
    last4: string;
    expMonth?: number;
    expYear?: number;
  };
  isDefault?: boolean;
}

export interface SetupIntentResponse {
  clientSecret: string;
  customerId?: string;
  url?: string; // Para redirect checkout
}

/**
 * Cria um Setup Intent para adicionar um novo cartão
 */
export async function createSetupIntent(token?: string): Promise<SetupIntentResponse> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`${API_BASE}/billing/payment-methods/setup-intent`, {
    method: 'POST',
    headers,
  });
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || 'Erro ao criar Setup Intent');
  }
  
  return res.json();
}

/**
 * Anexa um método de pagamento ao workspace
 */
export async function attachPaymentMethod(
  paymentMethodId: string,
  token?: string
): Promise<{ ok: boolean; paymentMethod: PaymentMethod }> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`${API_BASE}/billing/payment-methods/attach`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ paymentMethodId }),
  });
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || 'Erro ao anexar método de pagamento');
  }
  
  return res.json();
}

/**
 * Lista todos os métodos de pagamento do workspace
 */
export async function listPaymentMethods(token?: string): Promise<{ paymentMethods: PaymentMethod[] }> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`${API_BASE}/billing/payment-methods`, {
    headers,
  });
  
  if (!res.ok) {
    return { paymentMethods: [] };
  }
  
  return res.json();
}

/**
 * Define um método de pagamento como padrão
 */
export async function setDefaultPaymentMethod(
  paymentMethodId: string,
  token?: string
): Promise<{ ok: boolean }> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`${API_BASE}/billing/payment-methods/${paymentMethodId}/default`, {
    method: 'POST',
    headers,
  });
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || 'Erro ao definir método padrão');
  }
  
  return res.json();
}

/**
 * Remove um método de pagamento
 */
export async function removePaymentMethod(
  paymentMethodId: string,
  token?: string
): Promise<{ ok: boolean }> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`${API_BASE}/billing/payment-methods/${paymentMethodId}`, {
    method: 'DELETE',
    headers,
  });
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || 'Erro ao remover método de pagamento');
  }
  
  return res.json();
}

// ============================================
// Calendar API
// ============================================

export interface CalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  startTime: string;
  endTime: string;
  attendees?: string[];
  location?: string;
  meetingLink?: string;
}

/**
 * Lista eventos do calendário
 */
export async function listCalendarEvents(
  startDate?: string,
  endDate?: string,
  token?: string
): Promise<CalendarEvent[]> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const params = new URLSearchParams();
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);
  
  const res = await fetch(`${API_BASE}/calendar/events?${params.toString()}`, {
    headers,
  });
  
  if (!res.ok) {
    return [];
  }
  
  return res.json();
}

/**
 * Cria um evento no calendário
 */
export async function createCalendarEvent(
  event: Omit<CalendarEvent, 'id'>,
  token?: string
): Promise<CalendarEvent> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`${API_BASE}/calendar/events`, {
    method: 'POST',
    headers,
    body: JSON.stringify(event),
  });
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || 'Erro ao criar evento');
  }
  
  return res.json();
}

/**
 * Cancela um evento do calendário
 */
export async function cancelCalendarEvent(
  eventId: string,
  token?: string
): Promise<{ success: boolean }> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`${API_BASE}/calendar/events/${eventId}`, {
    method: 'DELETE',
    headers,
  });
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || 'Erro ao cancelar evento');
  }
  
  return res.json();
}

// ============================================
// Workspace API
// ============================================

export interface WorkspaceInfo {
  id: string;
  name: string;
  phone?: string;
  timezone?: string;
  providerSettings?: {
    webhookUrl?: string;
    notifications?: Record<string, boolean>;
    autopilot?: { enabled: boolean };
  };
  subscription?: {
    plan: string;
    status: string;
    currentPeriodEnd?: string;
  };
  stripeCustomerId?: string;
}

/**
 * Busca informações do workspace
 */
export async function getWorkspace(
  workspaceId: string,
  token?: string
): Promise<WorkspaceInfo> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`${API_BASE}/workspace/${workspaceId}`, {
    headers,
  });
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || 'Erro ao buscar workspace');
  }
  
  return res.json();
}

/**
 * Regenera a API Key - deleta a existente e cria uma nova
 */
export async function regenerateApiKey(token?: string): Promise<ApiKey> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  // Primeiro buscar keys existentes
  const existingKeys = await listApiKeys(token);
  
  // Deletar a primeira (key atual)
  if (existingKeys.length > 0) {
    await deleteApiKey(existingKeys[0].id, token);
  }
  
  // Criar nova key
  return createApiKey('Default API Key', token);
}

// ============ TOOLS API ============

export interface FollowUpConfig {
  contactId?: string;
  phone?: string;
  message: string;
  scheduledAt: string; // ISO date string
  type?: 'follow_up' | 'reminder' | 'promotion';
}

export interface MeetingConfig {
  contactId?: string;
  phone?: string;
  title: string;
  description?: string;
  scheduledAt: string;
  duration?: number; // minutes
  meetingLink?: string;
}

export interface DocumentUpload {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  createdAt: string;
}

export interface AIToolInfo {
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  lastUsed?: string;
  usageCount?: number;
}

/**
 * Lista todas as ferramentas disponíveis da IA
 */
export async function listAITools(token?: string): Promise<AIToolInfo[]> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`${API_BASE}/unified-agent/tools`, { headers });
  if (!res.ok) {
    // Fallback para lista estática se endpoint não existir
    return getStaticToolsList();
  }
  return res.json();
}

/**
 * Lista estática de ferramentas (fallback)
 */
function getStaticToolsList(): AIToolInfo[] {
  return [
    { name: 'send_message', description: 'Envia mensagem WhatsApp', category: 'messaging', enabled: true },
    { name: 'send_audio', description: 'Envia áudio gerado por IA', category: 'media', enabled: true },
    { name: 'send_document', description: 'Envia documento/PDF', category: 'media', enabled: true },
    { name: 'send_voice_note', description: 'Envia nota de voz', category: 'media', enabled: true },
    { name: 'schedule_followup', description: 'Agenda follow-up automático', category: 'scheduling', enabled: true },
    { name: 'schedule_meeting', description: 'Agenda reunião com lead', category: 'scheduling', enabled: true },
    { name: 'qualify_lead', description: 'Qualifica lead automaticamente', category: 'crm', enabled: true },
    { name: 'update_contact', description: 'Atualiza dados do contato', category: 'crm', enabled: true },
    { name: 'send_offer', description: 'Envia oferta de produto', category: 'sales', enabled: true },
    { name: 'handle_objection', description: 'Trata objeção de venda', category: 'sales', enabled: true },
    { name: 'send_invoice', description: 'Envia fatura/cobrança', category: 'payments', enabled: true },
    { name: 'create_payment_link', description: 'Cria link de pagamento', category: 'payments', enabled: true },
    { name: 'send_catalog', description: 'Envia catálogo de produtos', category: 'catalog', enabled: true },
    { name: 'search_knowledge', description: 'Busca na base de conhecimento', category: 'knowledge', enabled: true },
    { name: 'start_flow', description: 'Inicia fluxo de automação', category: 'automation', enabled: true },
  ];
}

/**
 * Agenda um follow-up
 */
export async function scheduleFollowUp(
  workspaceId: string,
  config: FollowUpConfig,
  token?: string
): Promise<{ success: boolean; jobId?: string; message?: string }> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`${API_BASE}/unified-agent/${workspaceId}/schedule-followup`, {
    method: 'POST',
    headers,
    body: JSON.stringify(config),
  });
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Erro ao agendar follow-up' }));
    throw new Error(error.message);
  }
  
  return res.json();
}

/**
 * Lista follow-ups agendados
 */
export async function listScheduledFollowUps(
  workspaceId: string,
  token?: string
): Promise<Array<{ id: string; phone: string; message: string; scheduledAt: string; status: string }>> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`${API_BASE}/unified-agent/${workspaceId}/followups`, { headers });
  
  if (!res.ok) {
    return [];
  }
  
  const data = await res.json();
  return data.followups || [];
}

/**
 * Cancela um follow-up agendado
 */
export async function cancelFollowUp(
  workspaceId: string,
  followUpId: string,
  token?: string
): Promise<{ success: boolean }> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`${API_BASE}/unified-agent/${workspaceId}/followups/${followUpId}`, {
    method: 'DELETE',
    headers,
  });
  
  return { success: res.ok };
}

/**
 * Upload de catálogo/documento
 */
export async function uploadDocument(
  workspaceId: string,
  file: File,
  type: 'catalog' | 'contract' | 'other' = 'other',
  token?: string
): Promise<DocumentUpload> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('type', type);
  
  const headers: HeadersInit = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`${API_BASE}/media/${workspaceId}/upload`, {
    method: 'POST',
    headers,
    body: formData,
  });
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Erro ao fazer upload' }));
    throw new Error(error.message);
  }
  
  return res.json();
}

/**
 * Lista documentos do workspace
 */
export async function listDocuments(
  workspaceId: string,
  token?: string
): Promise<DocumentUpload[]> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`${API_BASE}/media/${workspaceId}/documents`, { headers });
  
  if (!res.ok) {
    return [];
  }
  
  const data = await res.json();
  return data.documents || [];
}

/**
 * Configura script de objeções
 */
export async function saveObjectionScript(
  workspaceId: string,
  objection: string,
  response: string,
  token?: string
): Promise<{ success: boolean }> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`${API_BASE}/kloel/memory/${workspaceId}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      key: `objection_${Date.now()}`,
      value: { objection, response },
      type: 'objection_script',
      content: `OBJEÇÃO: ${objection}\nRESPOSTA: ${response}`,
    }),
  });
  
  return { success: res.ok };
}

/**
 * Lista scripts de objeções
 */
export async function listObjectionScripts(
  workspaceId: string,
  token?: string
): Promise<Array<{ id: string; objection: string; response: string }>> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`${API_BASE}/kloel/memory/${workspaceId}?type=objection_script`, { headers });
  
  if (!res.ok) {
    return [];
  }
  
  const data = await res.json();
  return (data.memories || []).map((m: any) => ({
    id: m.id,
    objection: m.value?.objection || '',
    response: m.value?.response || '',
  }));
}
/**
 * ============================================
 * API CLIENT - KLOEL FRONTEND V2
 * ============================================
 * Cliente HTTP configurado para comunicação com o backend NestJS.
 * Suporta autenticação JWT, refresh token, e tratamento de erros.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  status: number;
}

interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

// Storage keys
const TOKEN_KEY = 'kloel_access_token';
const REFRESH_TOKEN_KEY = 'kloel_refresh_token';
const WORKSPACE_KEY = 'kloel_workspace_id';

// Token management
export const tokenStorage = {
  getToken: (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(TOKEN_KEY);
  },
  
  setToken: (token: string): void => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(TOKEN_KEY, token);
  },
  
  getRefreshToken: (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },
  
  setRefreshToken: (token: string): void => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
  },
  
  getWorkspaceId: (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(WORKSPACE_KEY);
  },
  
  setWorkspaceId: (id: string): void => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(WORKSPACE_KEY, id);
  },
  
  clear: (): void => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(WORKSPACE_KEY);
  },
};

// Base fetch with auth headers
async function apiFetch<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = tokenStorage.getToken();
  const workspaceId = tokenStorage.getWorkspaceId();
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  if (workspaceId) {
    headers['x-workspace-id'] = workspaceId;
  }
  
  try {
    const res = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });
    
    // Handle 401 - try refresh token
    if (res.status === 401 && tokenStorage.getRefreshToken()) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        // Retry original request with new token
        headers['Authorization'] = `Bearer ${tokenStorage.getToken()}`;
        const retryRes = await fetch(`${API_URL}${endpoint}`, {
          ...options,
          headers,
        });
        const retryData = await retryRes.json().catch(() => ({}));
        return { data: retryData, status: retryRes.status };
      }
    }
    
    const data = await res.json().catch(() => ({}));
    
    if (!res.ok) {
      return {
        error: data.message || data.error || `HTTP ${res.status}`,
        status: res.status,
      };
    }
    
    return { data, status: res.status };
  } catch (err: any) {
    return {
      error: err.message || 'Network error',
      status: 0,
    };
  }
}

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = tokenStorage.getRefreshToken();
  if (!refreshToken) return false;
  
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    
    if (!res.ok) {
      tokenStorage.clear();
      return false;
    }
    
    const data = await res.json();
    if (data.accessToken) {
      tokenStorage.setToken(data.accessToken);
      if (data.refreshToken) {
        tokenStorage.setRefreshToken(data.refreshToken);
      }
      return true;
    }
    
    return false;
  } catch {
    tokenStorage.clear();
    return false;
  }
}

// ============================================
// AUTH API
// ============================================
export const authApi = {
  signUp: async (email: string, name: string, password: string) => {
    const res = await apiFetch<AuthTokens & { user: any; workspace: any }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, name, password }),
    });
    
    if (res.data?.accessToken) {
      tokenStorage.setToken(res.data.accessToken);
      if (res.data.refreshToken) {
        tokenStorage.setRefreshToken(res.data.refreshToken);
      }
      if (res.data.workspace?.id) {
        tokenStorage.setWorkspaceId(res.data.workspace.id);
      }
    }
    
    return res;
  },
  
  signIn: async (email: string, password: string) => {
    const res = await apiFetch<AuthTokens & { user: any; workspaces: any[] }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    
    if (res.data?.accessToken) {
      tokenStorage.setToken(res.data.accessToken);
      if (res.data.refreshToken) {
        tokenStorage.setRefreshToken(res.data.refreshToken);
      }
      // Use first workspace by default
      if (res.data.workspaces?.[0]?.id) {
        tokenStorage.setWorkspaceId(res.data.workspaces[0].id);
      }
    }
    
    return res;
  },
  
  signOut: async () => {
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => {});
    tokenStorage.clear();
  },
  
  getMe: () => apiFetch<{ user: any; workspaces: any[] }>('/auth/me'),
};

// ============================================
// WHATSAPP API
// ============================================
export const whatsappApi = {
  startSession: () => {
    const workspaceId = tokenStorage.getWorkspaceId();
    return apiFetch(`/whatsapp-api/session/start`, { method: 'POST' });
  },
  
  getStatus: () => {
    const workspaceId = tokenStorage.getWorkspaceId();
    return apiFetch(`/whatsapp-api/session/status`);
  },
  
  getQrCode: () => {
    const workspaceId = tokenStorage.getWorkspaceId();
    return apiFetch<{ available: boolean; qr?: string }>(`/whatsapp-api/session/qr`);
  },
  
  disconnect: () => {
    const workspaceId = tokenStorage.getWorkspaceId();
    return apiFetch(`/whatsapp-api/session/disconnect`, { method: 'DELETE' });
  },
};

// ============================================
// KLOEL CHAT API
// ============================================
export const kloelApi = {
  // Send message and get streaming response
  chat: async (
    message: string,
    onChunk: (chunk: string) => void,
    onDone: () => void,
    onError: (error: string) => void
  ) => {
    const token = tokenStorage.getToken();
    const workspaceId = tokenStorage.getWorkspaceId();
    
    if (!workspaceId) {
      onError('Workspace não configurado');
      return;
    }
    
    try {
      const res = await fetch(`${API_URL}/kloel/${workspaceId}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({ message }),
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        onError(errData.message || `HTTP ${res.status}`);
        return;
      }
      
      // Handle SSE streaming
      const reader = res.body?.getReader();
      if (!reader) {
        onError('Stream not available');
        return;
      }
      
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              onDone();
              return;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.chunk) {
                onChunk(parsed.chunk);
              }
              if (parsed.error) {
                onError(parsed.error);
                return;
              }
            } catch {
              // Plain text chunk
              onChunk(data);
            }
          }
        }
      }
      
      onDone();
    } catch (err: any) {
      onError(err.message || 'Connection failed');
    }
  },
  
  // Non-streaming chat (fallback)
  chatSync: (message: string) => {
    const workspaceId = tokenStorage.getWorkspaceId();
    return apiFetch<{ response: string }>(`/kloel/${workspaceId}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message, stream: false }),
    });
  },
  
  // Get conversation history
  getHistory: () => {
    const workspaceId = tokenStorage.getWorkspaceId();
    return apiFetch<{ messages: any[] }>(`/kloel/${workspaceId}/history`);
  },
};

// ============================================
// BILLING API
// ============================================
export const billingApi = {
  getSubscription: () => {
    const workspaceId = tokenStorage.getWorkspaceId();
    return apiFetch<{
      status: 'none' | 'trial' | 'active' | 'expired' | 'suspended';
      trialDaysLeft?: number;
      creditsBalance?: number;
      plan?: string;
      currentPeriodEnd?: string;
    }>(`/billing/${workspaceId}/subscription`);
  },
  
  activateTrial: () => {
    const workspaceId = tokenStorage.getWorkspaceId();
    return apiFetch(`/billing/${workspaceId}/activate-trial`, { method: 'POST' });
  },
  
  addPaymentMethod: (paymentMethodId: string) => {
    const workspaceId = tokenStorage.getWorkspaceId();
    return apiFetch(`/billing/${workspaceId}/payment-method`, {
      method: 'POST',
      body: JSON.stringify({ paymentMethodId }),
    });
  },
  
  getPaymentMethods: () => {
    const workspaceId = tokenStorage.getWorkspaceId();
    return apiFetch<{ methods: any[] }>(`/billing/${workspaceId}/payment-methods`);
  },
  
  createCheckoutSession: (priceId: string) => {
    const workspaceId = tokenStorage.getWorkspaceId();
    return apiFetch<{ url: string }>(`/billing/${workspaceId}/checkout`, {
      method: 'POST',
      body: JSON.stringify({ priceId }),
    });
  },
};

// ============================================
// WORKSPACE API
// ============================================
export const workspaceApi = {
  getSettings: () => {
    const workspaceId = tokenStorage.getWorkspaceId();
    return apiFetch(`/workspaces/${workspaceId}/settings`);
  },
  
  updateSettings: (settings: any) => {
    const workspaceId = tokenStorage.getWorkspaceId();
    return apiFetch(`/workspaces/${workspaceId}/settings`, {
      method: 'PATCH',
      body: JSON.stringify(settings),
    });
  },
};

export default {
  auth: authApi,
  whatsapp: whatsappApi,
  kloel: kloelApi,
  billing: billingApi,
  workspace: workspaceApi,
};
