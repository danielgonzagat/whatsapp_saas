// workspaceApi object and workspace-related types/functions
import { mutate } from 'swr';
import { apiFetch, tokenStorage } from './core';

const invalidateWorkspace = () =>
  mutate((key: string) => typeof key === 'string' && key.startsWith('/workspace'));
const invalidateBilling = () =>
  mutate((key: string) => typeof key === 'string' && key.startsWith('/billing'));
const invalidateSettings = () =>
  mutate((key: string) => typeof key === 'string' && key.startsWith('/settings'));

/** Workspace settings shape. */
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
  [key: string]: unknown;
}

/** Save workspace settings. */
export async function saveWorkspaceSettings(
  workspaceId: string,
  settings: WorkspaceSettings,
  _token?: string,
): Promise<Record<string, unknown>> {
  const res = await apiFetch<Record<string, unknown>>(`/workspace/${workspaceId}/account`, {
    method: 'POST',
    body: settings,
  });
  if (res.error) {
    throw new Error(res.error || 'Failed to save settings');
  }
  invalidateWorkspace();
  return res.data as Record<string, unknown>;
}

/** Api key shape. */
export interface ApiKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  lastUsedAt?: string;
}

/** List api keys. */
export async function listApiKeys(_token?: string): Promise<ApiKey[]> {
  const res = await apiFetch<ApiKey[]>(`/settings/api-keys`);
  if (res.error) {
    throw new Error(res.error || 'Failed to list API keys');
  }
  return res.data ?? [];
}

/** Create api key. */
export async function createApiKey(name: string, _token?: string): Promise<ApiKey> {
  const res = await apiFetch<ApiKey>(`/settings/api-keys`, {
    method: 'POST',
    body: { name },
  });
  if (res.error) {
    throw new Error(res.error || 'Failed to create API key');
  }
  invalidateSettings();
  return res.data as ApiKey;
}

/** Delete api key. */
export async function deleteApiKey(keyId: string, _token?: string): Promise<void> {
  const res = await apiFetch<{ ok: boolean }>(`/settings/api-keys/${keyId}`, {
    method: 'DELETE',
  });
  if (res.error) {
    throw new Error(res.error || 'Failed to delete API key');
  }
  invalidateSettings();
}

// Billing & Subscription standalone functions

export interface CheckoutResponse {
  url: string;
  sessionId?: string;
}

/** Create checkout session. */
export async function createCheckoutSession(
  workspaceId: string,
  plan: string,
  email: string,
  _token?: string,
): Promise<CheckoutResponse> {
  const res = await apiFetch<CheckoutResponse>(`/billing/checkout`, {
    method: 'POST',
    body: { workspaceId, plan, email },
  });
  if (res.error) {
    throw new Error(res.error || 'Failed to create checkout session');
  }
  invalidateBilling();
  return res.data as CheckoutResponse;
}

/** Subscription status shape. */
export interface SubscriptionStatus {
  plan: string;
  status: 'ACTIVE' | 'CANCELED' | 'PAST_DUE' | 'TRIAL';
  currentPeriodEnd?: string;
}

/** Get subscription status. */
export async function getSubscriptionStatus(_token?: string): Promise<SubscriptionStatus | null> {
  const res = await apiFetch<SubscriptionStatus>(`/billing/status`);
  if (res.error) {
    return null;
  }
  return res.data ?? null;
}

/** Activate trial. */
export async function activateTrial(): Promise<Record<string, unknown>> {
  const res = await apiFetch<Record<string, unknown>>(`/billing/activate-trial`, {
    method: 'POST',
  });
  if (res.error) {
    throw new Error(res.error || 'Failed to activate trial');
  }
  invalidateBilling();
  return res.data as Record<string, unknown>;
}

/** Cancel subscription. */
export async function cancelSubscription(): Promise<Record<string, unknown>> {
  const res = await apiFetch<Record<string, unknown>>(`/billing/cancel`, {
    method: 'POST',
  });
  if (res.error) {
    throw new Error(res.error || 'Failed to cancel subscription');
  }
  invalidateBilling();
  return res.data as Record<string, unknown>;
}

/** Get billing usage. */
export async function getBillingUsage(): Promise<Record<string, unknown>> {
  const res = await apiFetch<Record<string, unknown>>(`/billing/usage`);
  if (res.error) {
    throw new Error(res.error || 'Failed to get billing usage');
  }
  return res.data as Record<string, unknown>;
}

// Payment Methods API (Stripe)

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

/** Setup intent response shape. */
export interface SetupIntentResponse {
  clientSecret: string;
  customerId?: string;
  url?: string;
}

/** Create setup intent. */
export async function createSetupIntent(_token?: string): Promise<SetupIntentResponse> {
  const res = await apiFetch<SetupIntentResponse>(`/billing/payment-methods/setup-intent`, {
    method: 'POST',
  });
  if (res.error) {
    throw new Error(res.error || 'Erro ao criar Setup Intent');
  }
  return res.data as SetupIntentResponse;
}

/** Attach payment method. */
export async function attachPaymentMethod(
  paymentMethodId: string,
  _token?: string,
): Promise<{ ok: boolean; paymentMethod: PaymentMethod }> {
  const res = await apiFetch<{ ok: boolean; paymentMethod: PaymentMethod }>(
    `/billing/payment-methods/attach`,
    {
      method: 'POST',
      body: { paymentMethodId },
    },
  );
  if (res.error) {
    throw new Error(res.error || 'Erro ao anexar método de pagamento');
  }
  invalidateBilling();
  return res.data as { ok: boolean; paymentMethod: PaymentMethod };
}

/** List payment methods. */
export async function listPaymentMethods(
  _token?: string,
): Promise<{ paymentMethods: PaymentMethod[] }> {
  const res = await apiFetch<{ paymentMethods: PaymentMethod[] }>(`/billing/payment-methods`);
  if (res.error) {
    return { paymentMethods: [] };
  }
  return res.data as { paymentMethods: PaymentMethod[] };
}

/** Set default payment method. */
export async function setDefaultPaymentMethod(
  paymentMethodId: string,
  _token?: string,
): Promise<{ ok: boolean }> {
  const res = await apiFetch<{ ok: boolean }>(
    `/billing/payment-methods/${paymentMethodId}/default`,
    {
      method: 'POST',
    },
  );
  if (res.error) {
    throw new Error(res.error || 'Erro ao definir método padrão');
  }
  invalidateBilling();
  return res.data as { ok: boolean };
}

/** Remove payment method. */
export async function removePaymentMethod(
  paymentMethodId: string,
  _token?: string,
): Promise<{ ok: boolean }> {
  const res = await apiFetch<{ ok: boolean }>(`/billing/payment-methods/${paymentMethodId}`, {
    method: 'DELETE',
  });
  if (res.error) {
    throw new Error(res.error || 'Erro ao remover método de pagamento');
  }
  invalidateBilling();
  return res.data as { ok: boolean };
}

// Workspace Info

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

/** Get workspace. */
export async function getWorkspace(workspaceId: string, _token?: string): Promise<WorkspaceInfo> {
  const res = await apiFetch<WorkspaceInfo>(`/workspace/${workspaceId}`);
  if (res.error) {
    throw new Error(res.error || 'Erro ao buscar workspace');
  }
  return res.data as WorkspaceInfo;
}

/** Regenerate api key. */
export async function regenerateApiKey(_token?: string): Promise<ApiKey> {
  const existingKeys = await listApiKeys();
  if (existingKeys.length > 0) {
    await deleteApiKey(existingKeys[0].id);
  }
  return createApiKey('Default API Key');
}

// workspaceApi object

export const workspaceApi = {
  getSettings: () => {
    const workspaceId = tokenStorage.getWorkspaceId();
    return apiFetch(`/workspace/${workspaceId}/settings`);
  },

  updateSettings: async (settings: WorkspaceSettings) => {
    const workspaceId = tokenStorage.getWorkspaceId();
    const res = await apiFetch(`/workspace/${workspaceId}/settings`, {
      method: 'POST',
      body: settings,
    });
    invalidateWorkspace();
    return res;
  },

  getMe: () => {
    return apiFetch<Record<string, unknown>>('/workspace/me');
  },

  updateAccount: async (payload: {
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
    const res = await apiFetch(`/workspace/${workspaceId}/account`, {
      method: 'POST',
      body: payload,
    });
    invalidateWorkspace();
    return res;
  },

  getChannels: () => {
    const workspaceId = tokenStorage.getWorkspaceId();
    return apiFetch<Record<string, unknown>>(`/workspace/${workspaceId}/channels`);
  },

  updateChannels: async (payload: { email?: boolean }) => {
    const workspaceId = tokenStorage.getWorkspaceId();
    const res = await apiFetch(`/workspace/${workspaceId}/channels`, {
      method: 'POST',
      body: payload,
    });
    invalidateWorkspace();
    return res;
  },

  setProvider: async (provider: string) => {
    const workspaceId = tokenStorage.getWorkspaceId();
    const res = await apiFetch(`/workspace/${workspaceId}/provider`, {
      method: 'POST',
      body: { provider },
    });
    invalidateWorkspace();
    return res;
  },

  setJitter: async (min: number, max: number) => {
    const workspaceId = tokenStorage.getWorkspaceId();
    const res = await apiFetch(`/workspace/${workspaceId}/jitter`, {
      method: 'POST',
      body: { min, max },
    });
    invalidateWorkspace();
    return res;
  },
};
