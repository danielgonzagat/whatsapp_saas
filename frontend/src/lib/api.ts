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
  const res = await fetch(
    `${API_BASE}/whatsapp/${workspaceId}/status`,
    { credentials: 'include' },
  );

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
  const res = await fetch(`${API_BASE}/whatsapp/${workspaceId}/connect`, {
    method: 'GET',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to initiate WhatsApp connection');
  return res.json();
}

export async function getWhatsAppQR(workspaceId: string): Promise<{ qrCode: string | null; connected: boolean; status?: string; message?: string }> {
  const res = await fetch(`${API_BASE}/whatsapp/${workspaceId}/qr`, {
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
  const res = await fetch(`${API_BASE}/whatsapp/${workspaceId}/disconnect`, {
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
  
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/settings`, {
    method: 'POST',
    headers,
    body: JSON.stringify(settings),
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
  workspaceId: string,
  token?: string
): Promise<SubscriptionStatus | null> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`${API_BASE}/billing/status?workspaceId=${workspaceId}`, {
    headers,
  });
  
  if (!res.ok) {
    return null;
  }
  
  return res.json();
}
