// Miscellaneous: notifications, metrics, calendar, tools, member area, affiliate, dashboard
import { mutate } from 'swr';
import { API_BASE } from '../http';
import { apiFetch, tokenStorage } from './core';

// ============= SMART PAYMENT =============

export const smartPaymentApi = {
  create: (
    workspaceId: string,
    data: {
      amount: number;
      description: string;
      customerName: string;
      customerPhone: string;
      customerEmail?: string;
      method?: string;
      dueDate?: string;
    },
  ) =>
    apiFetch<{ paymentLink?: string; pixCode?: string; boletoUrl?: string; id: string }>(
      `/kloel/payment/${encodeURIComponent(workspaceId)}/create`,
      { method: 'POST', body: data },
    ),

  negotiate: (
    workspaceId: string,
    data: {
      paymentId: string;
      proposedAmount?: number;
      proposedDueDate?: string;
      installments?: number;
    },
  ) =>
    apiFetch<any>(`/kloel/payment/${encodeURIComponent(workspaceId)}/negotiate`, {
      method: 'POST',
      body: data,
    }),

  recoveryAnalysis: (workspaceId: string, paymentId: string) =>
    apiFetch<{
      score: number;
      recommendedAction: string;
      estimatedRecovery: number;
      insights: string[];
    }>(
      `/kloel/payment/${encodeURIComponent(workspaceId)}/recovery/${encodeURIComponent(paymentId)}`,
    ),
};

// ============= PAYMENTS STATUS =============

export async function getPaymentsStatus() {
  return apiFetch<{ status: string; healthy: boolean; providers: Record<string, string> }>(
    '/kloel/payments/status',
  );
}

// ============= FINANCE WEBHOOK RECENT =============

export async function getFinanceWebhookRecent(workspaceId: string, data?: { limit?: number }) {
  return apiFetch<any>(`/hooks/finance/${encodeURIComponent(workspaceId)}/recent`, {
    method: 'POST',
    body: data || {},
  });
}

// ============= KYC CHANGE PASSWORD (explicit apiFetch for PULSE detection) =============

export async function kycChangePassword(current: string, newPw: string) {
  return apiFetch('/api/kyc/security/change-password', {
    method: 'POST',
    body: { currentPassword: current, newPassword: newPw },
  });
}

// ============= CHECKOUT PUBLIC =============

export const checkoutPublicApi = {
  affiliateRedirect: (code: string) =>
    apiFetch<{ checkoutUrl: string; product?: any }>(
      `/checkout/public/r/${encodeURIComponent(code)}`,
    ),

  calculateShipping: (data: { slug: string; cep: string }) =>
    apiFetch<{
      options: Array<{
        carrier?: string;
        price: number;
        days: string;
        label?: string;
        name?: string;
      }>;
    }>('/checkout/public/shipping', { method: 'POST', body: data }),
};

// ============= REPORTS =============

export async function getAdSpendReport(params?: { startDate?: string; endDate?: string }) {
  const qs = new URLSearchParams();
  if (params?.startDate) qs.set('startDate', params.startDate);
  if (params?.endDate) qs.set('endDate', params.endDate);
  const q = qs.toString();
  return apiFetch<any>(`/reports/ad-spend${q ? `?${q}` : ''}`);
}

export async function sendReportEmail(data: {
  email: string;
  reportType?: string;
  period?: string;
  filters?: Record<string, any>;
}) {
  return apiFetch<{ success: boolean; message?: string }>('/reports/send-email', {
    method: 'POST',
    body: data,
  });
}

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
  if (token) headers.authorization = `Bearer ${token}`;
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
  _token?: string,
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
  _token?: string,
): Promise<CalendarEvent> {
  const res = await apiFetch<CalendarEvent>(`/calendar/events`, {
    method: 'POST',
    body: event,
  });
  if (res.error) throw new Error(res.error || 'Erro ao criar evento');
  mutate((key: string) => typeof key === 'string' && key.startsWith('/calendar'));
  return res.data as CalendarEvent;
}

export async function cancelCalendarEvent(
  eventId: string,
  _token?: string,
): Promise<{ success: boolean }> {
  const res = await apiFetch<{ success: boolean }>(`/calendar/events/${eventId}`, {
    method: 'DELETE',
  });
  if (res.error) throw new Error(res.error || 'Erro ao cancelar evento');
  mutate((key: string) => typeof key === 'string' && key.startsWith('/calendar'));
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
    return getStaticToolsList().map((t) => ({ ...t, enabled: false }));
  }
  return res.data ?? [];
}

function getStaticToolsList(): AIToolInfo[] {
  return [
    {
      name: 'send_message',
      description: 'Envia mensagem WhatsApp',
      category: 'messaging',
      enabled: true,
    },
    {
      name: 'send_audio',
      description: 'Envia áudio gerado por IA',
      category: 'media',
      enabled: true,
    },
    { name: 'send_document', description: 'Envia documento/PDF', category: 'media', enabled: true },
    { name: 'send_voice_note', description: 'Envia nota de voz', category: 'media', enabled: true },
    {
      name: 'schedule_followup',
      description: 'Agenda follow-up automático',
      category: 'scheduling',
      enabled: true,
    },
    {
      name: 'schedule_meeting',
      description: 'Agenda reunião com lead',
      category: 'scheduling',
      enabled: true,
    },
    {
      name: 'qualify_lead',
      description: 'Qualifica lead automaticamente',
      category: 'crm',
      enabled: true,
    },
    {
      name: 'update_contact',
      description: 'Atualiza dados do contato',
      category: 'crm',
      enabled: true,
    },
    {
      name: 'send_offer',
      description: 'Envia oferta de produto',
      category: 'sales',
      enabled: true,
    },
    {
      name: 'handle_objection',
      description: 'Trata objeção de venda',
      category: 'sales',
      enabled: true,
    },
    {
      name: 'send_invoice',
      description: 'Envia fatura/cobrança',
      category: 'payments',
      enabled: true,
    },
    {
      name: 'create_payment_link',
      description: 'Cria link de pagamento',
      category: 'payments',
      enabled: true,
    },
    {
      name: 'send_catalog',
      description: 'Envia catálogo de produtos',
      category: 'catalog',
      enabled: true,
    },
    {
      name: 'search_knowledge',
      description: 'Busca na base de conhecimento',
      category: 'knowledge',
      enabled: true,
    },
    {
      name: 'start_flow',
      description: 'Inicia fluxo de automação',
      category: 'automation',
      enabled: true,
    },
  ];
}

export async function scheduleFollowUp(
  workspaceId: string,
  config: FollowUpConfig,
  _token?: string,
): Promise<{ success: boolean; jobId?: string; message?: string }> {
  const res = await apiFetch<{ success: boolean; jobId?: string; message?: string }>(`/followups`, {
    method: 'POST',
    body: { workspaceId, ...config },
  });
  if (res.error) throw new Error(res.error || 'Erro ao agendar follow-up');
  mutate((key: string) => typeof key === 'string' && key.startsWith('/followups'));
  return res.data as { success: boolean; jobId?: string; message?: string };
}

export async function listScheduledFollowUps(
  workspaceId: string,
  _token?: string,
): Promise<
  Array<{ id: string; phone: string; message: string; scheduledAt: string; status: string }>
> {
  const res = await apiFetch<any>(`/followups?workspaceId=${encodeURIComponent(workspaceId)}`);
  if (res.error) return [];
  const data = res.data as Record<string, any> | undefined;
  return data?.followups || [];
}

export async function cancelFollowUp(
  _workspaceId: string,
  followUpId: string,
  _token?: string,
): Promise<{ success: boolean }> {
  const res = await apiFetch<any>(`/followups/${followUpId}`, {
    method: 'DELETE',
  });
  mutate((key: string) => typeof key === 'string' && key.startsWith('/followups'));
  return { success: !res.error };
}

export async function uploadDocument(
  _workspaceId: string,
  file: File,
  type: 'catalog' | 'contract' | 'other' = 'other',
  token?: string,
): Promise<DocumentUpload> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('type', type);

  const headers: HeadersInit = {};
  if (token) headers.Authorization = `Bearer ${token}`;

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
  _workspaceId: string,
  _token?: string,
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
  _token?: string,
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
  _token?: string,
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
  const res = await apiFetch<any>(`/marketplace/install/${encodeURIComponent(templateId)}`, {
    method: 'POST',
  });
  mutate((key: string) => typeof key === 'string' && key.startsWith('/marketplace'));
  return res;
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
  create: async (data: any) => {
    const res = await apiFetch<any>('/member-areas', { method: 'POST', body: data });
    mutate((key: string) => typeof key === 'string' && key.startsWith('/member-areas'));
    return res;
  },
  update: async (id: string, data: any) => {
    const res = await apiFetch<any>(`/member-areas/${id}`, { method: 'PUT', body: data });
    mutate((key: string) => typeof key === 'string' && key.startsWith('/member-areas'));
    return res;
  },
  remove: async (id: string) => {
    const res = await apiFetch<any>(`/member-areas/${id}`, { method: 'DELETE' });
    mutate((key: string) => typeof key === 'string' && key.startsWith('/member-areas'));
    return res;
  },
  createModule: async (areaId: string, data: any) => {
    const res = await apiFetch<any>(`/member-areas/${areaId}/modules`, {
      method: 'POST',
      body: data,
    });
    mutate((key: string) => typeof key === 'string' && key.startsWith('/member-areas'));
    return res;
  },
  createLesson: async (areaId: string, moduleId: string, data: any) => {
    const res = await apiFetch<any>(`/member-areas/${areaId}/modules/${moduleId}/lessons`, {
      method: 'POST',
      body: data,
    });
    mutate((key: string) => typeof key === 'string' && key.startsWith('/member-areas'));
    return res;
  },
  generateStructure: async (areaId: string) => {
    const res = await apiFetch<any>(`/member-areas/${areaId}/generate-structure`, {
      method: 'POST',
    });
    mutate((key: string) => typeof key === 'string' && key.startsWith('/member-areas'));
    return res;
  },
};

// ============= MEMBER AREA STUDENTS =============

export const memberAreaStudentsApi = {
  list: (areaId: string, q?: string) => {
    const qs = q ? `?q=${encodeURIComponent(q)}` : '';
    return apiFetch<any[]>(`/member-areas/${encodeURIComponent(areaId)}/students${qs}`);
  },
  update: async (areaId: string, studentId: string, data: Record<string, any>) => {
    const res = await apiFetch<any>(
      `/member-areas/${encodeURIComponent(areaId)}/students/${encodeURIComponent(studentId)}`,
      {
        method: 'PUT',
        body: data,
      },
    );
    mutate((key: string) => typeof key === 'string' && key.startsWith('/member-areas'));
    return res;
  },
};

// ============= GROWTH =============

export const growthApi = {
  activateMoneyMachine: () => apiFetch<any>('/growth/money-machine/activate', { method: 'POST' }),

  getMoneyMachineReport: () => apiFetch<any>('/growth/money-machine/report'),

  generateWhatsAppQr: (phone: string, message?: string) =>
    apiFetch<{ dataUrl: string; waUrl: string }>('/growth/qr/whatsapp', {
      method: 'POST',
      body: { phone, message },
    }),
};

// ============= KLOEL MEMORY =============

export const kloelMemoryApi = {
  save: (_workspaceId: string, key: string, value: any, category?: string, content?: string) =>
    apiFetch<any>('/kloel/memory/save', {
      method: 'POST',
      body: { key, value, category, content },
    }),

  delete: async (workspaceId: string, key: string) => {
    const res = await apiFetch<any>(
      `/kloel/memory/${encodeURIComponent(workspaceId)}/${encodeURIComponent(key)}`,
      {
        method: 'DELETE',
      },
    );
    mutate((key: string) => typeof key === 'string' && key.startsWith('/kloel/memory'));
    return res;
  },
};

// ============= FOLLOWUPS (PATCH) =============

export async function patchFollowup(
  id: string,
  data: {
    status?: string;
    scheduledAt?: string;
    message?: string;
    notes?: string;
    [key: string]: any;
  },
): Promise<any> {
  const res = await apiFetch<any>(`/followups/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: data,
  });
  if (res.error) throw new Error(res.error);
  mutate((k: string) => typeof k === 'string' && k.startsWith('/followups'));
  return res.data;
}

// ============= KLOEL FOLLOWUPS =============

export async function getKloelFollowups(contactId?: string): Promise<any[]> {
  const res = contactId
    ? await apiFetch<any>(`/kloel/followups/${encodeURIComponent(contactId)}`)
    : await apiFetch<any>('/kloel/followups');
  if (res.error) return [];
  const data = res.data;
  return Array.isArray(data) ? data : ((data as Record<string, any>)?.followups ?? []);
}

// ============= GDPR / LGPD =============

export const gdprApi = {
  requestDeletion: () =>
    apiFetch<{ success: boolean; message: string }>('/kloel/data/request-deletion', {
      method: 'POST',
    }),

  exportData: () =>
    apiFetch<{ contacts: any[]; messages: any[]; sales: any[]; exportedAt: string }>(
      '/kloel/data/export',
    ),
};

// ============= MARKETPLACE =============

export async function listMarketplaceTemplates(params?: {
  category?: string;
  search?: string;
  limit?: number;
}): Promise<any[]> {
  const qs = new URLSearchParams();
  if (params?.category) qs.set('category', params.category);
  if (params?.search) qs.set('search', params.search);
  if (params?.limit) qs.set('limit', String(params.limit));
  const query = qs.toString();
  const res = await apiFetch<any>(`/marketplace/templates${query ? `?${query}` : ''}`);
  if (res.error) return [];
  const data = res.data as Record<string, any> | undefined;
  return Array.isArray(data) ? data : (data?.templates ?? []);
}

// ============= PRODUCT IMPORT =============

export async function importProducts(data: {
  products: Array<{
    name: string;
    price?: number;
    description?: string;
    [key: string]: any;
  }>;
  source?: string;
}): Promise<{ imported: number; errors: any[] }> {
  const res = await apiFetch<any>('/products/import', {
    method: 'POST',
    body: data,
  });
  if (res.error) throw new Error(res.error);
  const resp = res.data as Record<string, any> | undefined;
  return {
    imported: Number(resp?.imported || 0),
    errors: Array.isArray(resp?.errors) ? resp.errors : [],
  };
}

export const affiliateApi = {
  marketplace: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
    return apiFetch<any>(`/affiliate/marketplace${qs}`);
  },
  marketplaceStats: () => apiFetch<any>('/affiliate/marketplace/stats'),
  categories: () => apiFetch<any>('/affiliate/marketplace/categories'),
  recommended: () => apiFetch<any>('/affiliate/marketplace/recommended'),
  requestAffiliation: async (productId: string) => {
    const res = await apiFetch<any>(`/affiliate/request/${productId}`, { method: 'POST' });
    mutate((key: string) => typeof key === 'string' && key.startsWith('/affiliate'));
    return res;
  },
  myProducts: () => apiFetch<any>('/affiliate/my-products'),
  listProduct: async (productId: string, config: any) => {
    const res = await apiFetch<any>(`/affiliate/list-product/${productId}`, {
      method: 'POST',
      body: config,
    });
    mutate((key: string) => typeof key === 'string' && key.startsWith('/affiliate'));
    return res;
  },

  /** GET /affiliate/my-links — links with clicks/sales/commission metrics */
  myLinks: () => apiFetch<any>('/affiliate/my-links'),

  /** PUT /affiliate/config/:productId — update commission/approval config for a listed product */
  configureProduct: async (
    productId: string,
    config: {
      commissionPct?: number;
      commissionType?: string;
      commissionFixed?: number;
      cookieDays?: number;
      approvalMode?: string;
      category?: string;
      tags?: string[];
      listed?: boolean;
      thumbnailUrl?: string;
      promoMaterials?: any;
    },
  ) => {
    const res = await apiFetch<any>(`/affiliate/config/${encodeURIComponent(productId)}`, {
      method: 'PUT',
      body: config,
    });
    mutate((key: string) => typeof key === 'string' && key.startsWith('/affiliate'));
    return res;
  },

  /** POST /affiliate/ai-search — search marketplace by keyword */
  aiSearch: (query: string) =>
    apiFetch<any>('/affiliate/ai-search', { method: 'POST', body: { query } }),

  /** POST /affiliate/suggest — get AI-suggested products based on workspace niche */
  suggest: () => apiFetch<any>('/affiliate/suggest', { method: 'POST' }),

  /** POST /affiliate/saved/:productId — bookmark a product */
  saveProduct: async (productId: string) => {
    const res = await apiFetch<any>(`/affiliate/saved/${encodeURIComponent(productId)}`, {
      method: 'POST',
    });
    mutate((key: string) => typeof key === 'string' && key.startsWith('/affiliate'));
    return res;
  },

  /** DELETE /affiliate/saved/:productId — remove bookmark */
  unsaveProduct: async (productId: string) => {
    const res = await apiFetch<any>(`/affiliate/saved/${encodeURIComponent(productId)}`, {
      method: 'DELETE',
    });
    mutate((key: string) => typeof key === 'string' && key.startsWith('/affiliate'));
    return res;
  },
};

// ============= CAMPAIGN MASS SEND =============

export const campaignMassSendApi = {
  /**
   * POST /campaign/start — enqueue a WhatsApp mass send campaign
   * Requires ADMIN role.
   */
  start: (workspaceId: string, user: string, numbers: string[], message: string) =>
    apiFetch<any>('/campaign/start', {
      method: 'POST',
      body: { workspaceId, user, numbers, message },
    }),
};

// ============= AI ASSISTANT =============

export const aiAssistantApi = {
  analyzeSentiment: (text: string) =>
    apiFetch<{ sentiment: string; score: number; label: string }>(
      '/ai/assistant/analyze-sentiment',
      {
        method: 'POST',
        body: { text },
      },
    ),

  summarize: (conversationId: string) =>
    apiFetch<{ summary: string }>('/ai/assistant/summarize', {
      method: 'POST',
      body: { conversationId },
    }),

  suggest: (workspaceId: string, conversationId: string, prompt?: string) =>
    apiFetch<{ suggestion: string }>('/ai/assistant/suggest', {
      method: 'POST',
      body: { workspaceId, conversationId, prompt },
    }),

  pitch: (workspaceId: string, conversationId: string) =>
    apiFetch<{ pitch: string }>('/ai/assistant/pitch', {
      method: 'POST',
      body: { workspaceId, conversationId },
    }),
};

// ============= KNOWLEDGE BASE UPLOAD =============

export async function uploadKnowledgeBase(file: File, kbId?: string): Promise<any> {
  const token = tokenStorage.getToken();

  const formData = new FormData();
  formData.append('file', file);
  if (kbId) formData.append('kbId', kbId);

  const headers: HeadersInit = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/ai/kb/upload`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Erro ao fazer upload' }));
    throw new Error(err.message || 'Erro ao fazer upload');
  }

  return res.json();
}

// ============= ONBOARDING API =============

export const onboardingApi = {
  /** POST /kloel/onboarding/:workspaceId/start — start conversational onboarding */
  start: (workspaceId: string) =>
    apiFetch<{ message: string }>(`/kloel/onboarding/${encodeURIComponent(workspaceId)}/start`, {
      method: 'POST',
    }),

  /** POST /kloel/onboarding/:workspaceId/chat — send a chat message (non-streaming) */
  chat: (workspaceId: string, message: string) =>
    apiFetch<{ message: string }>(`/kloel/onboarding/${encodeURIComponent(workspaceId)}/chat`, {
      method: 'POST',
      body: { message },
    }),

  /** GET /kloel/onboarding/:workspaceId/status — get onboarding status */
  status: (workspaceId: string) =>
    apiFetch<{
      completed: boolean;
      messagesCount: number;
      step?: string;
      data?: Record<string, any>;
    }>(`/kloel/onboarding/${encodeURIComponent(workspaceId)}/status`),
};

// ============= SCRAPERS API =============

export const scrapersApi = {
  /** POST /scrapers/jobs — create a new scraper job */
  createJob: (data: {
    workspaceId: string;
    type: 'MAPS' | 'INSTAGRAM' | 'GROUP';
    query: string;
    location?: string;
    flowId?: string;
  }) =>
    apiFetch<{ id: string; type: string; query: string; status: string; createdAt: string }>(
      '/scrapers/jobs',
      {
        method: 'POST',
        body: data,
      },
    ),

  /** POST /scrapers/jobs/:id/import — import scraped results into leads */
  importResults: (jobId: string, workspaceId: string) =>
    apiFetch<{ imported: number; errors?: any[] }>(
      `/scrapers/jobs/${encodeURIComponent(jobId)}/import`,
      {
        method: 'POST',
        body: { workspaceId },
      },
    ),
};

// ============= LAUNCH API =============

export const launchApi = {
  /** POST /launch/launcher — create a new group launcher */
  createLauncher: (data: { name: string; description?: string; [key: string]: any }) =>
    apiFetch<{ id: string; name: string; slug?: string; createdAt: string }>('/launch/launcher', {
      method: 'POST',
      body: data,
    }),

  /** POST /launch/launcher/:id/groups — add groups to a launcher */
  addGroups: (launcherId: string, data: { groupLink: string; [key: string]: any }) =>
    apiFetch<{ id: string; groupLink: string }>(
      `/launch/launcher/${encodeURIComponent(launcherId)}/groups`,
      {
        method: 'POST',
        body: data,
      },
    ),
};

// ============= AD RULES API =============

export const adRulesApi = {
  /** PUT /ad-rules/:id — update an ad rule */
  update: async (
    id: string,
    data: {
      name?: string;
      condition?: string;
      action?: string;
      alertMethod?: string;
      alertTarget?: string;
      active?: boolean;
    },
  ) => {
    const res = await apiFetch<any>(`/ad-rules/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: data,
    });
    mutate((key: string) => typeof key === 'string' && key.startsWith('/ad-rules'));
    return res;
  },
};

// ============= PARTNERSHIPS PERFORMANCE API =============

export const partnershipsApi = {
  /** GET /partnerships/affiliates/:id/performance — get affiliate performance metrics */
  affiliatePerformance: (affiliateId: string) =>
    apiFetch<{
      monthlyPerformance: number[];
      totalSales: number;
      totalRevenue: number;
      commission: number;
      lastSaleAt?: string;
    }>(`/partnerships/affiliates/${encodeURIComponent(affiliateId)}/performance`),
};

// ============= KLOEL LEADS API =============

export const kloelLeadsApi = {
  /** GET /kloel/leads/:workspaceId — get workspace leads from KLOEL */
  list: (workspaceId: string) => apiFetch<any[]>(`/kloel/leads/${encodeURIComponent(workspaceId)}`),
};

// ============= WEBINAR API =============

export const webinarApi = {
  update: async (
    id: string,
    data: {
      title?: string;
      url?: string;
      date?: string;
      description?: string;
      status?: string;
      productId?: string;
    },
  ) => {
    const res = await apiFetch<any>(`/webinars/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: data,
    });
    mutate((key: string) => typeof key === 'string' && key.startsWith('/webinars'));
    return res;
  },

  remove: async (id: string) => {
    const res = await apiFetch<any>(`/webinars/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    mutate((key: string) => typeof key === 'string' && key.startsWith('/webinars'));
    return res;
  },
};

// ============= VIDEO API =============

export const videoApi = {
  create: (inputUrl: string, prompt: string) =>
    apiFetch<{ id: string; status: string }>('/video/create', {
      method: 'POST',
      body: { inputUrl, prompt },
    }),

  getJob: (id: string) =>
    apiFetch<{
      id: string;
      status: string;
      outputUrl?: string;
      prompt?: string;
      createdAt: string;
    }>(`/video/job/${encodeURIComponent(id)}`),
};

// ============= VOICE API =============

export interface VoiceProfile {
  id: string;
  name: string;
  provider?: string;
  voiceId?: string;
  settings?: Record<string, any>;
  createdAt?: string;
}

export const voiceApi = {
  createProfile: (data: {
    name: string;
    provider?: string;
    voiceId?: string;
    settings?: Record<string, any>;
  }) =>
    apiFetch<VoiceProfile>('/voice/profiles', {
      method: 'POST',
      body: data,
    }),

  listProfiles: (workspaceId?: string) => {
    const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
    return apiFetch<VoiceProfile[] | { profiles: VoiceProfile[] }>(`/voice/profiles${qs}`);
  },

  generate: (data: {
    text: string;
    voiceProfileId?: string;
    voiceId?: string;
    provider?: string;
  }) =>
    apiFetch<{ audioUrl: string; duration?: number }>('/voice/generate', {
      method: 'POST',
      body: data,
    }),
};

// ============= MEDIA API =============

export const mediaApi = {
  processVideo: (data: {
    inputUrl?: string;
    prompt?: string;
    type?: string;
    workspaceId?: string;
  }) =>
    apiFetch<{ id: string; status: string }>('/media/video', {
      method: 'POST',
      body: data,
    }),

  getJob: (id: string) =>
    apiFetch<{ id: string; status: string; outputUrl?: string; createdAt: string }>(
      `/media/job/${encodeURIComponent(id)}`,
    ),
};

// ============================================
// KYC API — routed through Next.js proxy /api/kyc/*
// All mutation methods throw on error so callers
// can rely on try/catch for consistent feedback.
// ============================================

async function kycMutation<T = any>(
  endpoint: string,
  options?: Parameters<typeof apiFetch>[1],
): Promise<T> {
  const res = await apiFetch<T>(`/api${endpoint}`, options);
  if (res.error) throw new Error(res.error);
  return res.data as T;
}

export const kycApi = {
  // Profile
  getProfile: () => apiFetch('/api/kyc/profile'),
  updateProfile: (data: Record<string, any>) =>
    kycMutation('/kyc/profile', { method: 'PUT', body: data }),
  uploadAvatar: async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return kycMutation('/kyc/profile/avatar', { method: 'POST', body: fd });
  },

  // Fiscal
  getFiscalData: () => apiFetch('/api/kyc/fiscal'),
  updateFiscalData: (data: Record<string, any>) =>
    kycMutation('/kyc/fiscal', { method: 'PUT', body: data }),

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
  updateBankAccount: (data: Record<string, any>) =>
    kycMutation('/kyc/bank', { method: 'PUT', body: data }),

  // Security
  changePassword: (currentPassword: string, newPassword: string) =>
    kycMutation('/kyc/security/change-password', {
      method: 'POST',
      body: { currentPassword, newPassword },
    }),

  // KYC Status
  getKycStatus: () => apiFetch('/kyc/status'),
  getKycCompletion: () => apiFetch('/kyc/completion'),
  submitKyc: () => kycMutation('/kyc/submit', { method: 'POST' }),
};
