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
