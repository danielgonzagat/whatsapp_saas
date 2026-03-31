// Miscellaneous: notifications, metrics, calendar, tools, member area, affiliate, dashboard
import { API_BASE } from '../http';
import { apiFetch, tokenStorage } from './core';

// ============= NOTIFICATIONS =============

export async function registerNotificationDevice(token: string, platform: string): Promise<any> {
  const res = await apiFetch<any>(`/notifications/register-device`, {
    method: 'POST',
    body: { token, platform },
  });
  if (res.error) throw new Error('Failed to register device');
  return res.data;
}

// ============= METRICS =============

export async function getMetrics(token?: string): Promise<string> {
  const headers: Record<string, string> = {};
  if (token) headers['authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/metrics`, { headers });
  if (!res.ok) throw new Error('Failed to fetch metrics');
  return res.text();
}

export async function getQueueMetrics(_token?: string): Promise<any> {
  const res = await apiFetch<any>(`/metrics/queues`);
  if (res.error) throw new Error('Failed to fetch queue metrics');
  return res.data;
}

// ============= CALENDAR =============

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

export async function listCalendarEvents(
  startDate?: string,
  endDate?: string,
  _token?: string
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams();
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);

  const res = await apiFetch<CalendarEvent[]>(`/calendar/events?${params.toString()}`);
  if (res.error) return [];
  return res.data ?? [];
}

export async function createCalendarEvent(
  event: Omit<CalendarEvent, 'id'>,
  _token?: string
): Promise<CalendarEvent> {
  const res = await apiFetch<CalendarEvent>(`/calendar/events`, {
    method: 'POST',
    body: event,
  });
  if (res.error) throw new Error(res.error || 'Erro ao criar evento');
  return res.data as CalendarEvent;
}

export async function cancelCalendarEvent(
  eventId: string,
  _token?: string
): Promise<{ success: boolean }> {
  const res = await apiFetch<{ success: boolean }>(`/calendar/events/${eventId}`, {
    method: 'DELETE',
  });
  if (res.error) throw new Error(res.error || 'Erro ao cancelar evento');
  return res.data as { success: boolean };
}

// ============= TOOLS API =============

export interface FollowUpConfig {
  contactId?: string;
  phone?: string;
  message: string;
  scheduledAt: string;
  type?: 'follow_up' | 'reminder' | 'promotion';
}

export interface MeetingConfig {
  contactId?: string;
  phone?: string;
  title: string;
  description?: string;
  scheduledAt: string;
  duration?: number;
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

export async function listAITools(_token?: string, workspaceId?: string): Promise<AIToolInfo[]> {
  const wsId = workspaceId || tokenStorage.getWorkspaceId();
  const res = await apiFetch<AIToolInfo[]>(`/kloel/agent/${wsId}/tools`);
  if (res.error) {
    return getStaticToolsList().map(t => ({ ...t, enabled: false }));
  }
  return res.data ?? [];
}

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

export async function scheduleFollowUp(
  workspaceId: string,
  config: FollowUpConfig,
  _token?: string
): Promise<{ success: boolean; jobId?: string; message?: string }> {
  const res = await apiFetch<{ success: boolean; jobId?: string; message?: string }>(`/followups`, {
    method: 'POST',
    body: { workspaceId, ...config },
  });
  if (res.error) throw new Error(res.error || 'Erro ao agendar follow-up');
  return res.data as { success: boolean; jobId?: string; message?: string };
}

export async function listScheduledFollowUps(
  workspaceId: string,
  _token?: string
): Promise<Array<{ id: string; phone: string; message: string; scheduledAt: string; status: string }>> {
  const res = await apiFetch<any>(`/followups?workspaceId=${encodeURIComponent(workspaceId)}`);
  if (res.error) return [];
  const data = res.data as Record<string, any> | undefined;
  return data?.followups || [];
}

export async function cancelFollowUp(
  workspaceId: string,
  followUpId: string,
  _token?: string
): Promise<{ success: boolean }> {
  const res = await apiFetch<any>(`/followups/${followUpId}`, {
    method: 'DELETE',
  });
  return { success: !res.error };
}

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

  const res = await fetch(`${API_BASE}/media/documents/upload`, {
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

export async function listDocuments(
  workspaceId: string,
  _token?: string
): Promise<DocumentUpload[]> {
  const res = await apiFetch<any>(`/media/documents`);
  if (res.error) return [];
  const data = res.data as Record<string, any> | undefined;
  return data?.documents || [];
}

export async function saveObjectionScript(
  workspaceId: string,
  objection: string,
  response: string,
  _token?: string
): Promise<{ success: boolean }> {
  const res = await apiFetch<any>(`/kloel/memory/${workspaceId}/save`, {
    method: 'POST',
    body: {
      key: `objection_${Date.now()}`,
      value: { objection, response },
      type: 'objection_script',
      content: `OBJEÇÃO: ${objection}\nRESPOSTA: ${response}`,
    },
  });
  return { success: !res.error };
}

export async function listObjectionScripts(
  workspaceId: string,
  _token?: string
): Promise<Array<{ id: string; objection: string; response: string }>> {
  const res = await apiFetch<any>(`/kloel/memory/${workspaceId}/list?category=objection_script`);
  if (res.error) return [];
  const data = res.data as Record<string, any> | undefined;
  return (data?.memories || []).map((m: any) => ({
    id: m.id,
    objection: m.value?.objection || '',
    response: m.value?.response || '',
  }));
}

// ============= DASHBOARD & MISC =============

export async function getDashboardStats() {
  return apiFetch<any>('/dashboard/stats');
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

// ============================================
// KYC API — routed through Next.js proxy /api/kyc/*
// All mutation methods throw on error so callers
// can rely on try/catch for consistent feedback.
// ============================================

async function kycMutation<T = any>(endpoint: string, options?: Parameters<typeof apiFetch>[1]): Promise<T> {
  const res = await apiFetch<T>(`/api${endpoint}`, options);
  if (res.error) throw new Error(res.error);
  return res.data as T;
}

export const kycApi = {
  // Profile
  getProfile: () => apiFetch('/api/kyc/profile'),
  updateProfile: (data: Record<string, any>) => kycMutation('/kyc/profile', { method: 'PUT', body: data }),
  uploadAvatar: async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return kycMutation('/kyc/profile/avatar', { method: 'POST', body: fd });
  },

  // Fiscal
  getFiscalData: () => apiFetch('/api/kyc/fiscal'),
  updateFiscalData: (data: Record<string, any>) => kycMutation('/kyc/fiscal', { method: 'PUT', body: data }),

  // Documents
  getDocuments: () => apiFetch('/api/kyc/documents'),
  uploadDocument: async (type: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('type', type);
    return kycMutation('/kyc/documents/upload', { method: 'POST', body: fd });
  },
  deleteDocument: (docId: string) => kycMutation(`/kyc/documents/${docId}`, { method: 'DELETE' }),

  // Bank Account
  getBankAccount: () => apiFetch('/api/kyc/bank'),
  updateBankAccount: (data: Record<string, any>) => kycMutation('/kyc/bank', { method: 'PUT', body: data }),

  // Security
  changePassword: (currentPassword: string, newPassword: string) =>
    kycMutation('/kyc/security/change-password', { method: 'POST', body: { currentPassword, newPassword } }),

  // KYC Status
  getKycStatus: () => apiFetch('/kyc/status'),
  getKycCompletion: () => apiFetch('/kyc/completion'),
  submitKyc: () => kycMutation('/kyc/submit', { method: 'POST' }),
};
