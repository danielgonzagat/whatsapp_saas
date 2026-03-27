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
  provider?: string;
  workerAvailable?: boolean;
  workerHealthy?: boolean;
  workerError?: string | null;
  degraded?: boolean;
  qrAvailable?: boolean;
  browserSessionStatus?: string;
  screencastStatus?: string;
  viewerAvailable?: boolean;
  takeoverActive?: boolean;
  agentPaused?: boolean;
  lastObservationAt?: string | null;
  lastActionAt?: string | null;
  observationSummary?: string | null;
  activeProvider?: string | null;
  proofCount?: number;
  viewport?: {
    width: number;
    height: number;
  };
}

export interface WhatsAppProofEntry {
  id: string;
  workspaceId: string;
  kind: string;
  provider: string;
  summary: string;
  objective?: string | null;
  beforeImage?: string | null;
  afterImage?: string | null;
  action?: any;
  observation?: any;
  metadata?: Record<string, any> | null;
  createdAt: string;
}

export interface WhatsAppConnectResponse {
  status: string;
  message?: string;
  qrCode?: string;
  qrCodeImage?: string;
  error?: boolean;
}

export interface WhatsAppScreencastTokenResponse {
  token: string;
  expiresAt: string;
  workspaceId: string;
  requireToken?: boolean;
}

// Wallet API
export async function getWalletBalance(workspaceId: string): Promise<WalletBalance> {
  const res = await apiFetch<WalletBalance>(`/kloel/wallet/${encodeURIComponent(workspaceId)}/balance`);
  if (res.error) throw new Error(res.error);
  return (res.data as any) as WalletBalance;
}

export async function getWalletTransactions(workspaceId: string): Promise<WalletTransaction[]> {
  const res = await apiFetch<any>(`/kloel/wallet/${encodeURIComponent(workspaceId)}/transactions`);
  if (res.error) throw new Error(res.error);
  const data = res.data as any;
  if (Array.isArray(data)) return data;
  return data?.transactions || [];
}

export async function processSale(workspaceId: string, data: { amount: number; productName: string; customerPhone: string }): Promise<any> {
  const res = await apiFetch<any>(`/kloel/wallet/${encodeURIComponent(workspaceId)}/process-sale`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (res.error) throw new Error(res.error);
  return res.data;
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
function isConnectedWhatsAppStatus(data: any): boolean {
  const rawStatus = String(data?.status || '').toUpperCase();
  return (
    data?.connected === true ||
    rawStatus === 'CONNECTED' ||
    rawStatus === 'WORKING' ||
    rawStatus === 'CONNECTED'
  );
}

function normalizeWsBase(value: string | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const explicit = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(raw)
      ? new URL(raw)
      : new URL(
          `${
            typeof window !== 'undefined' && window.location.protocol === 'https:'
              ? 'wss:'
              : 'ws:'
          }//${raw.replace(/^\/+/, '')}`,
        );
    if (explicit.protocol === 'http:') explicit.protocol = 'ws:';
    if (explicit.protocol === 'https:') explicit.protocol = 'wss:';
    return explicit.toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export function getWhatsAppScreencastWsBase(): string {
  const explicit = normalizeWsBase(process.env.NEXT_PUBLIC_SCREENCAST_WS_URL);
  if (explicit) return explicit;

  // Without NEXT_PUBLIC_SCREENCAST_WS_URL there is no WebSocket proxy on the
  // frontend domain (nginx only exists in docker-compose, not on Railway).
  // Return empty to disable screencast gracefully instead of attempting a
  // connection to a non-existent /ws/screencast endpoint.
  return '';
}

export function buildWhatsAppScreencastWsUrl(
  workspaceId: string,
  token?: string,
): string {
  const base = getWhatsAppScreencastWsBase();
  if (!base || !workspaceId) {
    return '';
  }

  const safeToken = String(token || '').trim();
  return `${base}/stream/${encodeURIComponent(workspaceId)}?token=${encodeURIComponent(
    safeToken || 'guest',
  )}`;
}

export async function getWhatsAppStatus(_workspaceId: string): Promise<WhatsAppConnectionStatus> {
  const res = await apiFetch<any>(`/api/whatsapp-api/session/status`);
  if (res.error) throw new Error(res.error);

  const data = res.data as any;
  const connected = isConnectedWhatsAppStatus(data);
  const rawStatus = String(data?.status || '');
  const normalizedStatus =
    connected
      ? 'connected'
      : rawStatus === 'SCAN_QR_CODE'
        ? 'qr_pending'
        : rawStatus
          ? rawStatus.toLowerCase()
          : 'disconnected';

  return {
    connected,
    status: normalizedStatus,
    phone: data?.phone || data?.phoneNumber || undefined,
    pushName: data?.pushName || data?.businessName || undefined,
    qrCode: data?.qr || data?.qrCode || data?.qrCodeImage || null,
    message: data?.message,
    provider: data?.provider || data?.providerType,
    workerAvailable:
      typeof data?.workerAvailable === 'boolean' ? data.workerAvailable : true,
    workerHealthy:
      typeof data?.workerHealthy === 'boolean' ? data.workerHealthy : undefined,
    workerError: data?.workerError || null,
    degraded: Boolean(data?.degraded),
    qrAvailable:
      typeof data?.qrAvailable === 'boolean'
        ? data.qrAvailable
        : Boolean(data?.qr || data?.qrCode || data?.qrCodeImage),
    browserSessionStatus: data?.browserSessionStatus || undefined,
    screencastStatus: data?.screencastStatus || undefined,
    viewerAvailable: Boolean(data?.viewerAvailable),
    takeoverActive: Boolean(data?.takeoverActive),
    agentPaused: Boolean(data?.agentPaused),
    lastObservationAt: data?.lastObservationAt || null,
    lastActionAt: data?.lastActionAt || null,
    observationSummary: data?.observationSummary || null,
    activeProvider: data?.activeProvider || null,
    proofCount: Number(data?.proofCount || 0) || 0,
    viewport: data?.viewport,
  };
}

export async function initiateWhatsAppConnection(_workspaceId: string): Promise<WhatsAppConnectResponse> {
  const res = await apiFetch<any>(`/api/whatsapp-api/session/start`, {
    method: 'POST',
  });
  if (res.error) throw new Error(res.error);

  const data = res.data as any;
  return {
    status: data?.success === false ? 'error' : data?.message === 'already_connected' ? 'already_connected' : data?.qrCode ? 'qr_ready' : 'pending',
    message: data?.message,
    qrCode: data?.qr || data?.qrCode,
    qrCodeImage: data?.qrCodeImage || data?.qr || data?.qrCode,
    error: data?.success === false,
  };
}

export async function getWhatsAppQR(_workspaceId: string): Promise<{ qrCode: string | null; connected: boolean; status?: string; message?: string }> {
  const res = await apiFetch<any>(`/api/whatsapp-api/session/qr`);
  if (res.error) throw new Error(res.error);
  const data = res.data as any;

  if (data?.qr || data?.qrCodeImage || data?.qrCode) {
    return {
      qrCode: data?.qr || data?.qrCodeImage || data?.qrCode || null,
      connected: false,
      status: data?.available ? 'qr_ready' : 'no_qr',
      message: data?.message,
    };
  }

  const statusRes = await apiFetch<any>(`/api/whatsapp-api/session/status`);
  if (statusRes.error) throw new Error(statusRes.error);
  const statusData = statusRes.data as any;
  const connected = isConnectedWhatsAppStatus(statusData);
  const fallbackQr =
    statusData?.qr ||
    statusData?.qrCode ||
    statusData?.qrCodeImage ||
    null;
  return {
    qrCode: fallbackQr,
    connected,
    status:
      connected
        ? 'connected'
        : data?.available
          ? 'qr_ready'
          : 'no_qr',
    message: data?.message || statusData?.message,
  };
}

export async function disconnectWhatsApp(_workspaceId: string): Promise<any> {
  const res = await apiFetch<any>(`/api/whatsapp-api/session/disconnect`, {
    method: 'DELETE',
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function logoutWhatsApp(_workspaceId: string): Promise<any> {
  const res = await apiFetch<any>(`/api/whatsapp-api/session/logout`, {
    method: 'POST',
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function getWhatsAppViewer(_workspaceId: string): Promise<any> {
  const res = await apiFetch<any>(`/api/whatsapp-api/session/view`);
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function getWhatsAppScreencastToken(
  _workspaceId: string,
): Promise<WhatsAppScreencastTokenResponse> {
  const res = await apiFetch<any>(`/api/whatsapp-api/session/stream-token`, {
    method: 'POST',
  });
  if (res.error) throw new Error(res.error);
  return res.data as WhatsAppScreencastTokenResponse;
}

export async function performWhatsAppViewerAction(
  _workspaceId: string,
  action: Record<string, any>,
): Promise<any> {
  const res = await apiFetch<any>(`/api/whatsapp-api/session/action`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function takeoverWhatsAppViewer(_workspaceId: string): Promise<any> {
  const res = await apiFetch<any>(`/api/whatsapp-api/session/takeover`, {
    method: 'POST',
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function resumeWhatsAppAgent(_workspaceId: string): Promise<any> {
  const res = await apiFetch<any>(`/api/whatsapp-api/session/resume-agent`, {
    method: 'POST',
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function pauseWhatsAppAgent(
  _workspaceId: string,
  paused = true,
): Promise<any> {
  const res = await apiFetch<any>(`/api/whatsapp-api/session/pause-agent`, {
    method: 'POST',
    body: JSON.stringify({ paused }),
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function reconcileWhatsAppSession(
  _workspaceId: string,
  objective?: string,
): Promise<any> {
  const res = await apiFetch<any>(`/api/whatsapp-api/session/reconcile`, {
    method: 'POST',
    body: JSON.stringify({ objective }),
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function getWhatsAppProofs(
  _workspaceId: string,
  limit = 12,
): Promise<WhatsAppProofEntry[]> {
  const res = await apiFetch<any>(
    `/api/whatsapp-api/session/proofs?limit=${encodeURIComponent(String(limit))}`,
  );
  if (res.error) throw new Error(res.error);
  const data = res.data as any;
  return Array.isArray(data?.proofs) ? data.proofs : [];
}

export async function runWhatsAppActionTurn(
  _workspaceId: string,
  objective: string,
  dryRun = false,
  mode?: string,
): Promise<any> {
  const res = await apiFetch<any>(`/api/whatsapp-api/session/action-turn`, {
    method: 'POST',
    body: JSON.stringify({ objective, dryRun, mode }),
  });
  if (res.error) throw new Error(res.error);
  return res.data;
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

  const endpoint = `/kloel/leads/${encodeURIComponent(workspaceId)}${
    query.toString() ? `?${query.toString()}` : ''
  }`;

  const res = await apiFetch<any>(endpoint);
  if (res.error) throw new Error(res.error);

  const data = res.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray((data as any)?.leads)) return (data as any).leads;
  return [];
}

// ============= ANALYTICS =============

export interface AnalyticsDashboardStats {
  messages: number;
  contacts: number;
  flows: number;
  flowCompleted: number;
  flowFailed: number;
  flowRunning: number;
  deliveryRate: number;
  readRate: number;
  errorRate: number;
  sentiment: { positive: number; negative: number; neutral: number };
  leadScore: { high: number; medium: number; low: number };
}

export interface AnalyticsDailyActivityItem {
  date: string;
  inbound: number;
  outbound: number;
}

export interface AnalyticsAdvancedResponse {
  range: { startDate: string; endDate: string };
  sales: {
    totals: {
      totalCount: number;
      totalAmount: number;
      paidCount: number;
      paidAmount: number;
      conversionRate: number;
    };
    byDay: Array<{ day: string; paidAmount: number; paidCount: number; totalCount: number }>;
  };
  leads: { newContacts: number };
  inbox: {
    conversationsByStatus: Record<string, number>;
    waitingByQueue: Array<{ id: string; name: string; waitingCount: number }>;
  };
  funnels: {
    executionsByStatus: Record<string, number>;
    totals: {
      total: number;
      completed: number;
      failed: number;
      completionRate: number;
    };
    topFlows: Array<{ flowId: string; name: string; executions: number }>;
  };
  agents: { performance: Array<{ agentId: string | null; messageCount: number; avgResponseTime: number }> };
  queues: { stats: Array<{ id: string; name: string; waitingCount: number }> };
}

export async function getAnalyticsDashboard(): Promise<AnalyticsDashboardStats> {
  const res = await apiFetch<AnalyticsDashboardStats>(`/analytics/dashboard`);
  if (res.error) throw new Error(res.error);
  return (res.data as any) as AnalyticsDashboardStats;
}

export async function getAnalyticsDailyActivity(): Promise<AnalyticsDailyActivityItem[]> {
  const res = await apiFetch<AnalyticsDailyActivityItem[]>(`/analytics/activity`);
  if (res.error) throw new Error(res.error);
  return (res.data as any) || [];
}

export async function getAnalyticsAdvanced(params?: { startDate?: string; endDate?: string }): Promise<AnalyticsAdvancedResponse> {
  const query = buildQuery({ startDate: params?.startDate, endDate: params?.endDate });
  const res = await apiFetch<AnalyticsAdvancedResponse>(`/analytics/advanced${query}`);
  if (res.error) throw new Error(res.error);
  return (res.data as any) as AnalyticsAdvancedResponse;
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
  const res = await apiFetch<PaymentLinkResponse>(`/kloel/payments/create/${encodeURIComponent(workspaceId)}`, {
    method: 'POST',
    body: JSON.stringify({
      ...data,
      description: data.productName,
    }),
  });
  if (res.error) throw new Error(res.error);
  return (res.data as any) as PaymentLinkResponse;
}

// ============= CAMPAIGNS =============

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  status?: string;
  type?: string;
  targetAudience?: string;
  messageTemplate?: string;
  scheduledAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  stats?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
  parentId?: string | null;
  [key: string]: any;
}

export async function listCampaigns(workspaceId: string): Promise<Campaign[]> {
  const res = await apiFetch<any>(`/campaigns?workspaceId=${encodeURIComponent(workspaceId)}`);
  if (res.error) throw new Error(res.error);
  const data = res.data as any;
  if (Array.isArray(data)) return data;
  return data?.campaigns || [];
}

export async function createCampaign(workspaceId: string, payload: any): Promise<Campaign> {
  const res = await apiFetch<Campaign>(`/campaigns`, {
    method: 'POST',
    body: JSON.stringify({ workspaceId, ...payload }),
  });
  if (res.error) throw new Error(res.error);
  return (res.data as any) as Campaign;
}

export async function launchCampaign(
  workspaceId: string,
  campaignId: string,
  opts?: { smartTime?: boolean },
): Promise<any> {
  const res = await apiFetch<any>(`/campaigns/${encodeURIComponent(campaignId)}/launch`, {
    method: 'POST',
    body: JSON.stringify({ workspaceId, smartTime: !!opts?.smartTime }),
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function createCampaignVariants(
  workspaceId: string,
  campaignId: string,
  variants?: number,
): Promise<{ created: number; variantIds: string[] }> {
  const res = await apiFetch<{ created: number; variantIds: string[] }>(
    `/campaigns/${encodeURIComponent(campaignId)}/darwin/variants`,
    {
      method: 'POST',
      body: JSON.stringify({ workspaceId, variants }),
    },
  );
  if (res.error) throw new Error(res.error);
  return (res.data as any) as { created: number; variantIds: string[] };
}

export async function evaluateCampaignDarwin(workspaceId: string, campaignId: string): Promise<any> {
  const res = await apiFetch<any>(`/campaigns/${encodeURIComponent(campaignId)}/darwin/evaluate`, {
    method: 'POST',
    body: JSON.stringify({ workspaceId }),
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

// ============= ASAAS INTEGRATION =============

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
export type AutopilotPipeline = Record<string, any>;
export type SystemHealth = Record<string, any>;
export type AutopilotSmokeTest = Record<string, any>;
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

export async function getAutopilotPipeline(workspaceId: string, token?: string): Promise<AutopilotPipeline> {
  const res = await fetch(`${API_BASE}/autopilot/pipeline${buildQuery({ workspaceId })}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error('Failed to fetch autopilot pipeline');
  return res.json();
}

export async function runAutopilotSmokeTest(params: {
  workspaceId: string;
  phone?: string;
  message?: string;
  waitMs?: number;
  liveSend?: boolean;
  token?: string;
}): Promise<AutopilotSmokeTest> {
  const res = await fetch(`${API_BASE}/autopilot/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(params.token) },
    body: JSON.stringify({
      workspaceId: params.workspaceId,
      phone: params.phone,
      message: params.message,
      waitMs: params.waitMs,
      liveSend: params.liveSend,
    }),
  });
  if (!res.ok) throw new Error('Failed to run autopilot smoke test');
  return res.json();
}

export async function getSystemHealth(): Promise<SystemHealth> {
  const res = await fetch(`${API_BASE}/health/system`);
  if (!res.ok) throw new Error('Failed to fetch system health');
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
  const res = await apiFetch<any[]>(`/flows/templates`);
  if (res.error) throw new Error(res.error);
  return (res.data as any) || [];
}

export async function runFlow(body: { workspaceId: string; flow: Flow; startNode: string; user: string; flowId?: string }): Promise<any> {
  const res = await apiFetch<any>(`/flows/run`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function runSavedFlow(
  workspaceId: string,
  flowId: string,
  body: { startNode: string; user: string; flow?: Flow },
): Promise<any> {
  const res = await apiFetch<any>(`/flows/${workspaceId}/${flowId}/run`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function saveFlow(workspaceId: string, flowId: string, flow: Flow): Promise<any> {
  const res = await apiFetch<any>(`/flows/save/${workspaceId}/${flowId}`, {
    method: 'POST',
    body: JSON.stringify(flow),
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function updateFlow(workspaceId: string, flowId: string, flow: Flow): Promise<any> {
  const res = await apiFetch<any>(`/flows/${workspaceId}/${flowId}`, {
    method: 'PUT',
    body: JSON.stringify(flow),
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function createFlowVersion(
  workspaceId: string,
  flowId: string,
  payload: { nodes: FlowNode[]; edges: FlowEdge[]; label?: string },
): Promise<any> {
  const res = await apiFetch<any>(`/flows/version/${workspaceId}/${flowId}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function logFlowExecution(workspaceId: string, flowId: string, logs: any[], user?: string): Promise<any> {
  const res = await apiFetch<any>(`/flows/log/${workspaceId}/${flowId}`, {
    method: 'POST',
    body: JSON.stringify({ logs, user }),
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function getFlowLogs(workspaceId: string, flowId: string): Promise<FlowExecutionLog[]> {
  const res = await apiFetch<FlowExecutionLog[]>(`/flows/log/${workspaceId}/${flowId}`);
  if (res.error) throw new Error(res.error);
  return (res.data as any) || [];
}

export async function listFlows(workspaceId: string): Promise<Flow[]> {
  const res = await apiFetch<Flow[]>(`/flows/${workspaceId}`);
  if (res.error) throw new Error(res.error);
  return (res.data as any) || [];
}

export async function getFlow(workspaceId: string, flowId: string): Promise<Flow> {
  const res = await apiFetch<Flow>(`/flows/${workspaceId}/${flowId}`);
  if (res.error) throw new Error(res.error);
  return res.data as any;
}

export async function listFlowExecutions(workspaceId: string, limit = 50): Promise<any[]> {
  const res = await apiFetch<any[]>(`/flows/${workspaceId}/executions${buildQuery({ limit })}`);
  if (res.error) throw new Error(res.error);
  return (res.data as any) || [];
}

export async function getFlowExecution(executionId: string): Promise<any> {
  const res = await apiFetch<any>(`/flows/execution/${executionId}`);
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function retryFlowExecution(executionId: string): Promise<any> {
  const res = await apiFetch<any>(`/flows/execution/${executionId}/retry`, { method: 'POST' });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function listFlowVersions(workspaceId: string, flowId: string): Promise<any[]> {
  const res = await apiFetch<any[]>(`/flows/${workspaceId}/${flowId}/versions`);
  if (res.error) throw new Error(res.error);
  return (res.data as any) || [];
}

export async function getFlowVersion(workspaceId: string, flowId: string, versionId: string): Promise<any> {
  const res = await apiFetch<any>(`/flows/${workspaceId}/${flowId}/versions/${versionId}`);
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function createFlowFromTemplate(
  workspaceId: string,
  templateId: string,
  payload: { flowId?: string; name?: string },
): Promise<any> {
  const res = await apiFetch<any>(`/flows/${workspaceId}/from-template/${templateId}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

// ============= INBOX =============

export interface Conversation {
  id: string;
  contactId?: string;
  status?: string;
  lastMessageAt?: string;
  unreadCount?: number;
  contact?: { id: string; name?: string; phone?: string };
  assignedAgent?: { id: string; name?: string } | null;
  lastMessageStatus?: string | null;
  lastMessageErrorCode?: string | null;
  [key: string]: any;
}

export interface InboxAgent {
  id: string;
  name: string;
  email?: string;
  role?: string;
  isOnline?: boolean;
}

export interface Message {
  id: string;
  content?: string;
  direction?: 'INBOUND' | 'OUTBOUND';
  type?: string;
  status?: string;
  mediaUrl?: string | null;
  createdAt?: string;
  [key: string]: any;
}

export async function listConversations(workspaceId: string): Promise<Conversation[]> {
  const res = await apiFetch<Conversation[]>(`/inbox/${encodeURIComponent(workspaceId)}/conversations`);
  if (res.error) throw new Error(res.error);
  return (res.data as any) || [];
}

export async function listInboxAgents(workspaceId: string): Promise<InboxAgent[]> {
  const res = await apiFetch<InboxAgent[]>(`/inbox/${encodeURIComponent(workspaceId)}/agents`);
  if (res.error) throw new Error(res.error);
  return (res.data as any) || [];
}

export async function getConversationMessages(conversationId: string): Promise<Message[]> {
  const res = await apiFetch<Message[]>(`/inbox/conversations/${encodeURIComponent(conversationId)}/messages`);
  if (res.error) throw new Error(res.error);
  return (res.data as any) || [];
}

export async function closeConversation(conversationId: string): Promise<any> {
  const res = await apiFetch<any>(`/inbox/conversations/${encodeURIComponent(conversationId)}/close`, { method: 'POST' });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function assignConversation(conversationId: string, agentId: string): Promise<any> {
  const res = await apiFetch<any>(`/inbox/conversations/${encodeURIComponent(conversationId)}/assign`, {
    method: 'POST',
    body: JSON.stringify({ agentId }),
  });
  if (res.error) throw new Error(res.error);
  return res.data;
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
    if (endpoint.startsWith('http')) {
      const res = await fetch(endpoint);
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(error.message || 'Request failed');
      }
      const data = await res.json();
      return { data };
    }

    const res = await apiFetch<T>(endpoint, { method: 'GET' });
    if (res.error) throw new Error(res.error);
    return { data: res.data as T };
  },

  async post<T = any>(endpoint: string, body?: any): Promise<{ data: T }> {
    if (endpoint.startsWith('http')) {
      const res = await fetch(endpoint, {
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
    }

    const res = await apiFetch<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.error) throw new Error(res.error);
    return { data: res.data as T };
  },

  async put<T = any>(endpoint: string, body?: any): Promise<{ data: T }> {
    if (endpoint.startsWith('http')) {
      const res = await fetch(endpoint, {
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
    }

    const res = await apiFetch<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.error) throw new Error(res.error);
    return { data: res.data as T };
  },

  async delete<T = any>(endpoint: string): Promise<{ data: T }> {
    if (endpoint.startsWith('http')) {
      const res = await fetch(endpoint, { method: 'DELETE' });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(error.message || 'Request failed');
      }
      const data = await res.json();
      return { data };
    }

    const res = await apiFetch<T>(endpoint, { method: 'DELETE' });
    if (res.error) throw new Error(res.error);
    return { data: res.data as T };
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

const API_URL = API_BASE;

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
const STORAGE_EVENT = 'kloel-storage-changed';

function emitStorageChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(STORAGE_EVENT));
}

export function resolveWorkspaceFromAuthPayload(payload: any): {
  id: string;
  name?: string;
} | null {
  const explicitWorkspace = payload?.workspace;
  if (explicitWorkspace?.id) {
    return explicitWorkspace;
  }

  const explicitWorkspaceId = String(payload?.user?.workspaceId || '').trim();
  const workspaces = Array.isArray(payload?.workspaces) ? payload.workspaces : [];

  if (explicitWorkspaceId) {
    const matchedWorkspace = workspaces.find((workspace: any) => {
      return String(workspace?.id || '').trim() === explicitWorkspaceId;
    });

    if (matchedWorkspace?.id) {
      return matchedWorkspace;
    }

    return {
      id: explicitWorkspaceId,
      name: payload?.user?.workspaceName || 'Workspace',
    };
  }

  const firstWorkspace = workspaces[0];
  if (firstWorkspace?.id) {
    return firstWorkspace;
  }

  return null;
}

// Token management
export const tokenStorage = {
  getToken: (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(TOKEN_KEY);
  },
  
  setToken: (token: string): void => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(TOKEN_KEY, token);
    emitStorageChange();
  },
  
  getRefreshToken: (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },
  
  setRefreshToken: (token: string): void => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
    emitStorageChange();
  },
  
  getWorkspaceId: (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(WORKSPACE_KEY);
  },
  
  setWorkspaceId: (id: string): void => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(WORKSPACE_KEY, id);
    emitStorageChange();
  },
  
  clear: (): void => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(WORKSPACE_KEY);
    emitStorageChange();
  },
};

// Base fetch with auth headers
export async function apiFetch<T = any>(
  endpoint: string,
  options: Omit<RequestInit, 'body'> & { body?: any; params?: Record<string, string | undefined> } = {}
): Promise<ApiResponse<T>> {
  const token = tokenStorage.getToken();
  const workspaceId = tokenStorage.getWorkspaceId();
  const isProxyEndpoint = endpoint.startsWith('/api/');
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    if (isProxyEndpoint) {
      headers['x-kloel-access-token'] = token;
    }
  }
  
  if (workspaceId) {
    headers['x-workspace-id'] = workspaceId;
    if (isProxyEndpoint) {
      headers['x-kloel-workspace-id'] = workspaceId;
    }
  }

  let url = isProxyEndpoint ? endpoint : `${API_URL}${endpoint}`;

  // Append query params if provided
  if (options.params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined) searchParams.set(key, value);
    }
    const qs = searchParams.toString();
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;
  }

  // Auto-stringify body if it's an object
  const body = options.body && typeof options.body === 'object' && !(options.body instanceof FormData) && !(options.body instanceof Blob) && !(options.body instanceof ArrayBuffer)
    ? JSON.stringify(options.body)
    : options.body;

  try {
    const res = await fetch(url, {
      ...options,
      body,
      headers,
    });
    
    // Handle 401 - try refresh token
    if (res.status === 401 && tokenStorage.getRefreshToken()) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        // Retry original request with new token
        headers['Authorization'] = `Bearer ${tokenStorage.getToken()}`;
        const retryRes = await fetch(url, {
          ...options,
          headers,
          body,
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
    const res = await fetch(`/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    
    if (!res.ok) {
      tokenStorage.clear();
      return false;
    }
    
    const data = await res.json();
    const newToken = data.access_token || data.accessToken;
    const newRefresh = data.refresh_token || data.refreshToken;
    if (newToken) {
      tokenStorage.setToken(newToken);
      if (newRefresh) {
        tokenStorage.setRefreshToken(newRefresh);
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
    const res = await apiFetch<any>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, name, password }),
    });
    
    const token = res.data?.access_token || res.data?.accessToken;
    const refresh = res.data?.refresh_token || res.data?.refreshToken;
    if (token) {
      tokenStorage.setToken(token);
      if (refresh) {
        tokenStorage.setRefreshToken(refresh);
      }
      const wsId = resolveWorkspaceFromAuthPayload(res.data)?.id;
      if (wsId) {
        tokenStorage.setWorkspaceId(wsId);
      }
    }
    
    return res;
  },
  
  signIn: async (email: string, password: string) => {
    const res = await apiFetch<any>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    
    const token = res.data?.access_token || res.data?.accessToken;
    const refresh = res.data?.refresh_token || res.data?.refreshToken;
    if (token) {
      tokenStorage.setToken(token);
      if (refresh) {
        tokenStorage.setRefreshToken(refresh);
      }
      const wsId = resolveWorkspaceFromAuthPayload(res.data)?.id;
      if (wsId) {
        tokenStorage.setWorkspaceId(wsId);
      }
    }
    
    return res;
  },

  signInWithGoogle: async (credential: string) => {
    const res = await apiFetch<any>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential }),
    });

    const token = res.data?.access_token || res.data?.accessToken;
    const refresh = res.data?.refresh_token || res.data?.refreshToken;
    if (token) {
      tokenStorage.setToken(token);
      if (refresh) {
        tokenStorage.setRefreshToken(refresh);
      }
      const wsId = resolveWorkspaceFromAuthPayload(res.data)?.id;
      if (wsId) {
        tokenStorage.setWorkspaceId(wsId);
      }
    }

    return res;
  },
  
  signOut: async () => {
    tokenStorage.clear();
  },
  
  getMe: () => apiFetch<any>('/api/workspace/me'),
};

// ============================================
// WHATSAPP API
// ============================================
export const whatsappApi = {
  startSession: () => {
    return apiFetch(`/api/whatsapp-api/session/start`, { method: 'POST' });
  },

  bootstrapSession: () => {
    return apiFetch<{
      connected: boolean;
      status?: string;
      message?: string;
      pendingConversations?: number;
      pendingMessages?: number;
      options?: string[];
    }>(`/api/whatsapp-api/session/bootstrap`, { method: 'POST' });
  },

  startBacklog: (mode: string, limit?: number) => {
    return apiFetch<{
      queued: boolean;
      runId?: string;
      mode?: string;
      totalQueued?: number;
      message?: string;
    }>(`/api/whatsapp-api/session/backlog/start`, {
      method: 'POST',
      body: JSON.stringify({ mode, limit }),
    });
  },

  getCiaIntelligence: () => {
    return apiFetch<{
      businessState: any;
      marketSignals: any[];
      humanTasks: any[];
      demandStates: any[];
      insights: any[];
    }>(`/api/whatsapp-api/cia/intelligence`);
  },
  
  getStatus: () => {
    return apiFetch(`/api/whatsapp-api/session/status`);
  },
  
  getQrCode: () => {
    return apiFetch<{ available: boolean; qr?: string }>(`/api/whatsapp-api/session/qr`);
  },

  claimSession: (sourceWorkspaceId: string) => {
    return apiFetch<{
      success: boolean;
      message?: string;
      sessionName?: string;
      status?: any;
      bootstrap?: any;
    }>(`/api/whatsapp-api/session/claim`, {
      method: 'POST',
      body: JSON.stringify({ sourceWorkspaceId }),
    });
  },
  
  disconnect: () => {
    return apiFetch(`/api/whatsapp-api/session/disconnect`, { method: 'DELETE' });
  },

  logout: () => {
    return apiFetch(`/api/whatsapp-api/session/logout`, { method: 'POST' });
  },

  getViewer: () => {
    return apiFetch<any>(`/api/whatsapp-api/session/view`);
  },

  takeover: () => {
    return apiFetch<any>(`/api/whatsapp-api/session/takeover`, {
      method: 'POST',
    });
  },

  resumeAgent: () => {
    return apiFetch<any>(`/api/whatsapp-api/session/resume-agent`, {
      method: 'POST',
    });
  },

  performViewerAction: (action: Record<string, any>) => {
    return apiFetch<any>(`/api/whatsapp-api/session/action`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
  },

  getContacts: () => {
    return apiFetch<any[]>(`/whatsapp-api/contacts`);
  },

  createContact: (body: { phone: string; name?: string; email?: string }) => {
    return apiFetch<any>(`/whatsapp-api/contacts`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  getChats: () => {
    return apiFetch<any[]>(`/api/whatsapp-api/chats`);
  },

  getChatMessages: (
    chatId: string,
    params?: { limit?: number; offset?: number; downloadMedia?: boolean },
  ) => {
    return apiFetch<any[]>(
      `/api/whatsapp-api/chats/${encodeURIComponent(chatId)}/messages${buildQuery({
        limit: params?.limit,
        offset: params?.offset,
        downloadMedia: params?.downloadMedia ? 'true' : undefined,
      })}`,
    );
  },

  setPresence: (
    chatId: string,
    presence: 'typing' | 'paused' | 'seen',
  ) => {
    return apiFetch<any>(
      `/whatsapp-api/chats/${encodeURIComponent(chatId)}/presence`,
      {
        method: 'POST',
        body: JSON.stringify({ presence }),
      },
    );
  },

  getBacklog: () => {
    return apiFetch<any>(`/whatsapp-api/backlog`);
  },

  syncHistory: (reason?: string) => {
    return apiFetch<any>(`/whatsapp-api/sync`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },
};

export interface CiaSurfaceResponse {
  title: string;
  subtitle: string;
  workspaceName?: string | null;
  state: string;
  today: {
    soldAmount: number;
    activeConversations: number;
    pendingPayments: number;
  };
  now: {
    message: string;
    phase?: string | null;
    type: string;
    ts?: string;
  } | null;
  recent: Array<{
    type: string;
    message: string;
    phase?: string | null;
    ts?: string;
    meta?: Record<string, any>;
  }>;
  businessState?: Record<string, any> | null;
  humanTasks?: CiaHumanTask[];
  cognition?: CiaCognitiveHighlight[];
  marketSignals?: any[];
  insights?: any[];
  runtime?: Record<string, any> | null;
  autonomy?: Record<string, any> | null;
}

export interface CiaCognitiveHighlight {
  id: string;
  category: string;
  type?: string | null;
  contactId?: string | null;
  conversationId?: string | null;
  phone?: string | null;
  summary: string;
  nextBestAction?: string | null;
  intent?: string | null;
  stage?: string | null;
  outcome?: string | null;
  confidence?: number | null;
  updatedAt?: string | null;
}

export interface CiaHumanTask {
  id: string;
  taskType: string;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reason: string;
  suggestedReply?: string;
  businessImpact?: string;
  contactId?: string;
  phone?: string;
  conversationId?: string | null;
  status?: 'OPEN' | 'APPROVED' | 'REJECTED' | 'RESOLVED';
  resolvedAt?: string;
  approvedReply?: string | null;
  createdAt: string;
}

export const ciaApi = {
  getSurface: (workspaceId: string) => {
    return apiFetch<CiaSurfaceResponse>(
      `/cia/surface/${encodeURIComponent(workspaceId)}`,
    );
  },

  activateAutopilotTotal: (workspaceId: string, limit?: number) => {
    return apiFetch<any>(`/cia/autopilot-total/${encodeURIComponent(workspaceId)}`, {
      method: 'POST',
      body: JSON.stringify({ limit }),
    });
  },

  getHumanTasks: (workspaceId: string) => {
    return apiFetch<CiaHumanTask[]>(
      `/cia/human-tasks/${encodeURIComponent(workspaceId)}`,
    );
  },

  approveHumanTask: (
    workspaceId: string,
    taskId: string,
    body?: { message?: string; resume?: boolean },
  ) => {
    return apiFetch<any>(
      `/cia/human-tasks/${encodeURIComponent(workspaceId)}/${encodeURIComponent(taskId)}/approve`,
      {
        method: 'POST',
        body: JSON.stringify(body || {}),
      },
    );
  },

  rejectHumanTask: (workspaceId: string, taskId: string) => {
    return apiFetch<any>(
      `/cia/human-tasks/${encodeURIComponent(workspaceId)}/${encodeURIComponent(taskId)}/reject`,
      {
        method: 'POST',
      },
    );
  },

  resumeConversation: (workspaceId: string, conversationId: string) => {
    return apiFetch<any>(
      `/cia/conversations/${encodeURIComponent(workspaceId)}/${encodeURIComponent(conversationId)}/resume`,
      {
        method: 'POST',
      },
    );
  },
};

export async function autostartCia(workspaceId: string, limit?: number) {
  const res = await ciaApi.activateAutopilotTotal(workspaceId, limit);
  if (res.error) {
    throw new Error(res.error);
  }
  return res.data;
}

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
    
    try {
      const res = await fetch(`${API_URL}/kloel/think`, {
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
    return apiFetch<{ response: string }>(`/kloel/think/sync`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  },
  
  // Get conversation history
  getHistory: () => {
    return apiFetch<{ messages: any[] }>(`/kloel/history`);
  },
};

// ============================================
// BILLING API
// ============================================
export const billingApi = {
  getSubscription: () => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error("missing_workspaceId");
    }
    return apiFetch<{
      status: 'none' | 'trial' | 'active' | 'expired' | 'suspended';
      trialDaysLeft?: number;
      creditsBalance?: number;
      plan?: string;
      currentPeriodEnd?: string;
    }>(`/billing/subscription?workspaceId=${encodeURIComponent(workspaceId)}`);
  },
  
  activateTrial: () => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error("missing_workspaceId");
    }
    return apiFetch(`/billing/activate-trial?workspaceId=${encodeURIComponent(workspaceId)}`, { method: 'POST' });
  },
  
  addPaymentMethod: (paymentMethodId: string) => {
    return apiFetch(`/billing/payment-methods/attach`, {
      method: 'POST',
      body: JSON.stringify({ paymentMethodId }),
    });
  },
  
  getPaymentMethods: () => {
    return apiFetch<{ paymentMethods: any[] }>(`/billing/payment-methods`);
  },

  createSetupIntent: (returnUrl?: string) => {
    return apiFetch<{ clientSecret?: string; customerId?: string; url?: string }>(
      `/billing/payment-methods/setup-intent`,
      {
        method: 'POST',
        body: JSON.stringify({ returnUrl }),
      },
    );
  },

  setDefaultPaymentMethod: (paymentMethodId: string) => {
    return apiFetch<{ ok: boolean }>(`/billing/payment-methods/${encodeURIComponent(paymentMethodId)}/default`, {
      method: 'POST',
    });
  },

  removePaymentMethod: (paymentMethodId: string) => {
    return apiFetch<{ ok: boolean }>(`/billing/payment-methods/${encodeURIComponent(paymentMethodId)}`, {
      method: 'DELETE',
    });
  },
  
  createCheckoutSession: (priceId: string) => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error("missing_workspaceId");
    }
    // Mantém a assinatura como (priceId) por compatibilidade; o backend espera (plan)
    return apiFetch<{ url: string }>(`/billing/checkout`, {
      method: 'POST',
      body: JSON.stringify({ workspaceId, plan: priceId }),
    });
  },

  getAsaasStatus: () => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error("missing_workspaceId");
    }
    return apiFetch<AsaasStatus>(`/kloel/asaas/${encodeURIComponent(workspaceId)}/status`);
  },

  connectAsaas: (apiKey: string, environment: 'sandbox' | 'production' = 'sandbox') => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error("missing_workspaceId");
    }
    return apiFetch<any>(`/kloel/asaas/${encodeURIComponent(workspaceId)}/connect`, {
      method: 'POST',
      body: JSON.stringify({ apiKey, environment }),
    });
  },

  disconnectAsaas: () => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error("missing_workspaceId");
    }
    return apiFetch<any>(`/kloel/asaas/${encodeURIComponent(workspaceId)}/disconnect`, {
      method: 'DELETE',
    });
  },

  getAsaasBalance: () => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error("missing_workspaceId");
    }
    return apiFetch<AsaasBalance>(`/kloel/asaas/${encodeURIComponent(workspaceId)}/balance`);
  },

  listAsaasPayments: (params?: { status?: string; startDate?: string; endDate?: string }) => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error("missing_workspaceId");
    }
    const search = new URLSearchParams();
    if (params?.status) search.set('status', params.status);
    if (params?.startDate) search.set('startDate', params.startDate);
    if (params?.endDate) search.set('endDate', params.endDate);
    const qs = search.toString();
    return apiFetch<{ total: number; payments: AsaasPaymentRecord[] }>(
      `/kloel/asaas/${encodeURIComponent(workspaceId)}/payments${qs ? `?${qs}` : ''}`,
    );
  },

  createAsaasPix: (payload: {
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    amount: number;
    description: string;
    externalReference?: string;
  }) => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error("missing_workspaceId");
    }
    return apiFetch<any>(`/kloel/asaas/${encodeURIComponent(workspaceId)}/pix`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  createAsaasBoleto: (payload: {
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    customerCpfCnpj: string;
    amount: number;
    description: string;
    externalReference?: string;
  }) => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error("missing_workspaceId");
    }
    return apiFetch<any>(`/kloel/asaas/${encodeURIComponent(workspaceId)}/boleto`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getSalesReport: (period: string = 'week') => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error("missing_workspaceId");
    }
    return apiFetch<SalesReportSummary>(
      `/kloel/payments/report/${encodeURIComponent(workspaceId)}?period=${encodeURIComponent(period)}`,
    );
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

  getMe: () => {
    return apiFetch<any>('/workspace/me');
  },

  updateAccount: (payload: {
    name?: string;
    phone?: string;
    timezone?: string;
    webhookUrl?: string;
    website?: string;
    language?: string;
    dateFormat?: string;
    notifications?: Record<string, boolean>;
  }) => {
    const workspaceId = tokenStorage.getWorkspaceId();
    return apiFetch(`/workspace/${workspaceId}/account`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getChannels: () => {
    const workspaceId = tokenStorage.getWorkspaceId();
    return apiFetch<any>(`/workspace/${workspaceId}/channels`);
  },

  updateChannels: (payload: { email?: boolean; telegram?: boolean }) => {
    const workspaceId = tokenStorage.getWorkspaceId();
    return apiFetch(`/workspace/${workspaceId}/channels`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  setProvider: (provider: string) => {
    const workspaceId = tokenStorage.getWorkspaceId();
    return apiFetch(`/workspace/${workspaceId}/provider`, {
      method: 'POST',
      body: JSON.stringify({ provider }),
    });
  },

  setJitter: (min: number, max: number) => {
    const workspaceId = tokenStorage.getWorkspaceId();
    return apiFetch(`/workspace/${workspaceId}/jitter`, {
      method: 'POST',
      body: JSON.stringify({ min, max }),
    });
  },
};

// ============================================
// PRODUCT API
// ============================================

export interface CatalogProduct {
  id: string;
  name: string;
  description?: string | null;
  price?: number | null;
  category?: string | null;
  imageUrl?: string | null;
  paymentLink?: string | null;
  sku?: string | null;
  active?: boolean;
  featured?: boolean;
  metadata?: Record<string, any> | null;
}

export const productApi = {
  getStats: async () => apiFetch<any>('/products/stats'),
  list: (params?: { category?: string; active?: boolean; search?: string }) => {
    const search = new URLSearchParams();
    if (params?.category) search.set('category', params.category);
    if (typeof params?.active === 'boolean') search.set('active', String(params.active));
    if (params?.search) search.set('search', params.search);
    const qs = search.toString();
    return apiFetch<{ products: CatalogProduct[]; count: number }>(`/products${qs ? `?${qs}` : ''}`);
  },

  get: (id: string) => {
    return apiFetch<{ product: CatalogProduct | null; error?: string }>(`/products/${encodeURIComponent(id)}`);
  },

  create: (payload: {
    name: string;
    description?: string;
    price: number;
    category?: string;
    imageUrl?: string;
    paymentLink?: string;
    sku?: string;
  }) => {
    return apiFetch<{ product: CatalogProduct; success: boolean }>(`/products`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  update: (
    id: string,
    payload: Partial<{
      name: string;
      description: string;
      price: number;
      category: string;
      imageUrl: string;
      paymentLink: string;
      sku: string;
      active: boolean;
      featured: boolean;
      metadata: Record<string, any>;
    }>,
  ) => {
    return apiFetch<{ product: CatalogProduct; success: boolean }>(`/products/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  remove: (id: string) => {
    return apiFetch<{ success: boolean; deleted?: string; error?: string }>(`/products/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  getCategories: () => {
    return apiFetch<{ categories: string[] }>(`/products/categories/list`);
  },
};

export const externalPaymentApi = {
  list: (workspaceId: string) => getExternalPaymentLinks(workspaceId),
  add: (
    workspaceId: string,
    data: {
      platform: ExternalPaymentLink['platform'];
      productName: string;
      price: number;
      paymentUrl: string;
      checkoutUrl?: string;
      affiliateUrl?: string;
    },
  ) => addExternalPaymentLink(workspaceId, data),
  toggle: (workspaceId: string, linkId: string) =>
    toggleExternalPaymentLink(workspaceId, linkId),
  remove: (workspaceId: string, linkId: string) =>
    deleteExternalPaymentLink(workspaceId, linkId),
  configurePlatform: (
    workspaceId: string,
    payload: Record<string, any>,
  ) =>
    apiFetch<any>(`/kloel/external-payments/${encodeURIComponent(workspaceId)}/platform`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getPlatforms: (workspaceId: string) =>
    apiFetch<{ platforms: any[] }>(`/kloel/external-payments/${encodeURIComponent(workspaceId)}/platforms`),
  generateTracking: (
    workspaceId: string,
    payload: {
      baseUrl: string;
      source?: string;
      medium?: string;
      campaign?: string;
      content?: string;
      leadId?: string;
    },
  ) =>
    apiFetch<{ originalUrl: string; trackingUrl: string }>(
      `/kloel/external-payments/${encodeURIComponent(workspaceId)}/tracking`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),
};

export const knowledgeBaseApi = {
  list: () => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error("missing_workspaceId");
    }
    return apiFetch<KnowledgeBaseItem[]>(`/ai/kb/list?workspaceId=${encodeURIComponent(workspaceId)}`);
  },

  create: (name: string) => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error("missing_workspaceId");
    }
    return apiFetch<KnowledgeBaseItem>(`/ai/kb/create`, {
      method: 'POST',
      body: JSON.stringify({ workspaceId, name }),
    });
  },

  addSource: (knowledgeBaseId: string, payload: { type: 'TEXT' | 'URL' | 'PDF'; content: string }) => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error("missing_workspaceId");
    }
    return apiFetch<any>(`/ai/kb/source`, {
      method: 'POST',
      body: JSON.stringify({ workspaceId, knowledgeBaseId, ...payload }),
    });
  },

  listSources: (knowledgeBaseId: string) => {
    return apiFetch<KnowledgeSourceItem[]>(`/ai/kb/${encodeURIComponent(knowledgeBaseId)}/sources`);
  },
};

export interface CrmContactTag {
  id: string
  name: string
}

export interface CrmContact {
  id: string
  name?: string | null
  phone: string
  email?: string | null
  notes?: string | null
  tags?: CrmContactTag[]
  customFields?: Record<string, any> | null
  createdAt?: string
  updatedAt?: string
}

export interface CrmStage {
  id: string
  name: string
  order: number
  color?: string | null
}

export interface CrmPipeline {
  id: string
  name: string
  stages: CrmStage[]
}

export interface CrmDeal {
  id: string
  title: string
  value?: number | null
  status?: string | null
  stageId: string
  contactId?: string | null
  contact?: CrmContact | null
  stage?: {
    id: string
    name: string
    pipeline?: {
      id: string
      name: string
    } | null
  } | null
  createdAt?: string
  updatedAt?: string
}

export interface SegmentationPreset {
  name: string
  label?: string
  description?: string
}

export interface SegmentationStats {
  workspaceId: string
  segments: Record<string, number>
  total: number
}

export const crmApi = {
  listContacts: (params?: { page?: number; limit?: number; search?: string }) => {
    const search = new URLSearchParams()
    if (params?.page) search.set('page', String(params.page))
    if (params?.limit) search.set('limit', String(params.limit))
    if (params?.search) search.set('search', params.search)
    const qs = search.toString()
    return apiFetch<{ data: CrmContact[]; meta: { total: number; page: number; limit: number; pages: number } }>(
      `/crm/contacts${qs ? `?${qs}` : ''}`,
    )
  },

  createContact: (payload: { name?: string; phone: string; email?: string; notes?: string }) =>
    apiFetch<CrmContact>(`/crm/contacts`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  addTag: (phone: string, tag: string) =>
    apiFetch<CrmContact>(`/crm/contacts/${encodeURIComponent(phone)}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tag }),
    }),

  removeTag: (phone: string, tag: string) =>
    apiFetch<CrmContact | null>(`/crm/contacts/${encodeURIComponent(phone)}/tags/${encodeURIComponent(tag)}`, {
      method: 'DELETE',
    }),

  listPipelines: () => apiFetch<CrmPipeline[]>(`/crm/pipelines`),

  createPipeline: (name: string) =>
    apiFetch<CrmPipeline>(`/crm/pipelines`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  listDeals: () => apiFetch<CrmDeal[]>(`/crm/deals`),

  createDeal: (payload: { contactId: string; stageId: string; title: string; value: number }) =>
    apiFetch<CrmDeal>(`/crm/deals`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  moveDeal: (dealId: string, stageId: string) =>
    apiFetch<CrmDeal>(`/crm/deals/${encodeURIComponent(dealId)}/move`, {
      method: 'PUT',
      body: JSON.stringify({ stageId }),
    }),

  updateDeal: (
    dealId: string,
    payload: Partial<{
      title: string
      value: number
      status: string
    }>,
  ) =>
    apiFetch<CrmDeal>(`/crm/deals/${encodeURIComponent(dealId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteDeal: (dealId: string) =>
    apiFetch<{ id: string }>(`/crm/deals/${encodeURIComponent(dealId)}`, {
      method: 'DELETE',
    }),
}

export const segmentationApi = {
  getPresets: () => apiFetch<{ presets: SegmentationPreset[] }>(`/segmentation/presets`),

  getStats: () => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error("missing_workspaceId");
    }
    return apiFetch<SegmentationStats>(`/segmentation/${encodeURIComponent(workspaceId)}/stats`);
  },

  getPresetSegment: (presetName: string, limit?: number) => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error("missing_workspaceId");
    }
    const qs = limit ? `?limit=${encodeURIComponent(String(limit))}` : '';
    return apiFetch<{ contacts: CrmContact[]; total: number; preset: string }>(
      `/segmentation/${encodeURIComponent(workspaceId)}/preset/${encodeURIComponent(presetName)}${qs}`,
    );
  },

  autoSegment: () => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error("missing_workspaceId");
    }
    return apiFetch<any>(`/segmentation/${encodeURIComponent(workspaceId)}/auto-segment`, {
      method: 'POST',
    });
  },
};

// ════════════════════════════════════════════
// MISSING ENDPOINTS — Added for Cosmos completeness
// ════════════════════════════════════════════

export async function getDashboardStats() {
  return apiFetch<any>('/dashboard/stats');
}

export async function getAutopilotMoneyReport(workspaceId: string) {
  return apiFetch<any>(`/autopilot/money-report?workspaceId=${encodeURIComponent(workspaceId)}`);
}

export async function getAutopilotRevenueEvents(workspaceId: string, limit = 20) {
  return apiFetch<any>(`/autopilot/revenue-events?workspaceId=${encodeURIComponent(workspaceId)}&limit=${limit}`);
}

export async function getAutopilotNextBestAction(workspaceId: string, contactId: string) {
  return apiFetch<any>(`/autopilot/next-best-action?workspaceId=${encodeURIComponent(workspaceId)}&contactId=${encodeURIComponent(contactId)}`);
}

export async function installMarketplaceTemplate(templateId: string) {
  return apiFetch<any>(`/marketplace/install/${encodeURIComponent(templateId)}`, { method: 'POST' });
}

export async function getFollowupsApi(workspaceId?: string) {
  const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
  return apiFetch<any>(`/followups${qs}`);
}

export async function getFollowupStatsApi(workspaceId?: string) {
  const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
  return apiFetch<any>(`/followups/stats${qs}`);
}

export const memberAreaApi = {
  list: () => apiFetch<any>('/member-areas'),
  stats: () => apiFetch<any>('/member-areas/stats'),
  get: (id: string) => apiFetch<any>(`/member-areas/${id}`),
  create: (data: any) => apiFetch<any>('/member-areas', { method: 'POST', body: data }),
  update: (id: string, data: any) => apiFetch<any>(`/member-areas/${id}`, { method: 'PUT', body: data }),
  remove: (id: string) => apiFetch<any>(`/member-areas/${id}`, { method: 'DELETE' }),
  createModule: (areaId: string, data: any) => apiFetch<any>(`/member-areas/${areaId}/modules`, { method: 'POST', body: data }),
  createLesson: (areaId: string, moduleId: string, data: any) => apiFetch<any>(`/member-areas/${areaId}/modules/${moduleId}/lessons`, { method: 'POST', body: data }),
  generateStructure: (areaId: string) => apiFetch<any>(`/member-areas/${areaId}/generate-structure`, { method: 'POST' }),
};

export const affiliateApi = {
  marketplace: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiFetch<any>(`/affiliate/marketplace${qs}`);
  },
  marketplaceStats: () => apiFetch<any>('/affiliate/marketplace/stats'),
  categories: () => apiFetch<any>('/affiliate/marketplace/categories'),
  recommended: () => apiFetch<any>('/affiliate/marketplace/recommended'),
  requestAffiliation: (productId: string) => apiFetch<any>(`/affiliate/request/${productId}`, { method: 'POST' }),
  myProducts: () => apiFetch<any>('/affiliate/my-products'),
  listProduct: (productId: string, config: any) => apiFetch<any>(`/affiliate/list-product/${productId}`, { method: 'POST', body: config }),
};

const apiClient = {
  auth: authApi,
  whatsapp: whatsappApi,
  kloel: kloelApi,
  billing: billingApi,
  workspace: workspaceApi,
  products: productApi,
  externalPayments: externalPaymentApi,
  knowledgeBase: knowledgeBaseApi,
  crm: crmApi,
  segmentation: segmentationApi,
};

export default apiClient;
