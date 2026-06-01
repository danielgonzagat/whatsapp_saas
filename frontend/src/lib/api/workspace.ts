// workspaceApi object and workspace-related types/functions
import { mutate } from 'swr';
import { apiFetch, tokenStorage } from './core';

const invalidateWorkspace = () =>
  mutate((key: string) => typeof key === 'string' && key.startsWith('/workspace'));
const invalidateSettings = () =>
  mutate((key: string) => typeof key === 'string' && key.startsWith('/settings'));

/** Workspace settings shape. */
export interface WorkspaceSettings {
  /** Name property. */
  name?: string;
  /** Phone property. */
  phone?: string;
  /** Timezone property. */
  timezone?: string;
  /** Webhook url property. */
  webhookUrl?: string;
  /** Notifications property. */
  notifications?: {
    email?: boolean;
    whatsapp?: boolean;
    newLead?: boolean;
    newSale?: boolean;
    lowBalance?: boolean;
  };
  [key: string]: unknown;
}

type WorkspaceApiEnvelope<T> = {
  data?: T;
  error?: string;
  status?: number;
};

function confirmWorkspacePayload<T>(
  response: WorkspaceApiEnvelope<T>,
  fallbackMessage: string,
  missingPayloadMessage: string,
): T {
  if (response.error) {
    throw new Error(response.error);
  }
  if (typeof response.status === 'number' && response.status >= 400) {
    throw new Error(fallbackMessage);
  }
  if (response.data === undefined || response.data === null) {
    throw new Error(missingPayloadMessage);
  }
  return response.data;
}

function confirmWorkspaceListPayload<T>(
  response: WorkspaceApiEnvelope<T[]>,
  fallbackMessage: string,
  missingPayloadMessage: string,
): T[] {
  const data = confirmWorkspacePayload(response, fallbackMessage, missingPayloadMessage);
  if (!Array.isArray(data)) {
    throw new Error(missingPayloadMessage);
  }
  return data;
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
  const data = confirmWorkspacePayload(
    res,
    'Failed to save settings',
    'Workspace settings save did not return a confirmed payload',
  );
  invalidateWorkspace();
  return data;
}

/** Api key shape. */
export interface ApiKey {
  /** Id property. */
  id: string;
  /** Name property. */
  name: string;
  /** Key property. */
  key: string;
  /** Created at property. */
  createdAt: string;
  /** Last used at property. */
  lastUsedAt?: string;
}

/** List api keys. */
export async function listApiKeys(_token?: string): Promise<ApiKey[]> {
  const res = await apiFetch<ApiKey[]>(`/settings/api-keys`);
  return confirmWorkspaceListPayload(
    res,
    'Failed to list API keys',
    'API key list did not return a confirmed payload',
  );
}

/** Create api key. */
export async function createApiKey(name: string, _token?: string): Promise<ApiKey> {
  const res = await apiFetch<ApiKey>(`/settings/api-keys`, {
    method: 'POST',
    body: { name },
  });
  const data = confirmWorkspacePayload(
    res,
    'Failed to create API key',
    'API key creation did not return a confirmed payload',
  );
  invalidateSettings();
  return data;
}

/** Delete api key. */
export async function deleteApiKey(keyId: string, _token?: string): Promise<void> {
  const res = await apiFetch<{ ok?: boolean; count?: number }>(`/settings/api-keys/${keyId}`, {
    method: 'DELETE',
  });
  // Backend delete() returns the Prisma deleteMany payload (`{ count }`), which
  // has no `ok` field, so a non-error envelope with status < 400 and a present
  // payload is the real success signal. Only when an envelope explicitly
  // reports `ok: false` (e.g. a proxy wrapping the result) is it a failure.
  const data = confirmWorkspacePayload(
    res,
    'Failed to delete API key',
    'API key deletion did not return confirmed success',
  );
  if (data.ok === false) {
    throw new Error('API key deletion did not return confirmed success');
  }
  invalidateSettings();
}

// Workspace Info

export interface WorkspaceInfo {
  /** Id property. */
  id: string;
  /** Name property. */
  name: string;
  /** Phone property. */
  phone?: string;
  /** Timezone property. */
  timezone?: string;
  /** Provider settings property. */
  providerSettings?: {
    webhookUrl?: string;
    notifications?: Record<string, boolean>;
    autopilot?: { enabled: boolean };
  };
  /** Subscription property. */
  subscription?: {
    plan: string;
    status: string;
    currentPeriodEnd?: string;
  };
  /** Stripe customer id property. */
  stripeCustomerId?: string;
}

/** Get workspace. */
export async function getWorkspace(workspaceId: string, _token?: string): Promise<WorkspaceInfo> {
  const res = await apiFetch<WorkspaceInfo>(`/workspace/${workspaceId}`);
  return confirmWorkspacePayload(
    res,
    'Erro ao buscar workspace',
    'Workspace did not return a confirmed payload',
  );
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

type WorkspaceMutationEnvelope = { error?: string | undefined; status: number };

function confirmWorkspaceMutation<T extends WorkspaceMutationEnvelope>(
  response: T,
  fallbackMessage: string,
): T {
  if (response.error) {
    throw new Error(response.error);
  }
  if (response.status >= 400) {
    throw new Error(fallbackMessage);
  }
  return response;
}

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
    const confirmed = confirmWorkspaceMutation(res, 'Falha ao atualizar configuracoes do workspace.');
    invalidateWorkspace();
    return confirmed;
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
    const confirmed = confirmWorkspaceMutation(res, 'Falha ao atualizar conta do workspace.');
    invalidateWorkspace();
    return confirmed;
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
    const confirmed = confirmWorkspaceMutation(res, 'Falha ao atualizar canais do workspace.');
    invalidateWorkspace();
    return confirmed;
  },

  setProvider: async (provider: string) => {
    const workspaceId = tokenStorage.getWorkspaceId();
    const res = await apiFetch(`/workspace/${workspaceId}/provider`, {
      method: 'POST',
      body: { provider },
    });
    const confirmed = confirmWorkspaceMutation(res, 'Falha ao atualizar provedor do workspace.');
    invalidateWorkspace();
    return confirmed;
  },

  setJitter: async (min: number, max: number) => {
    const workspaceId = tokenStorage.getWorkspaceId();
    const res = await apiFetch(`/workspace/${workspaceId}/jitter`, {
      method: 'POST',
      body: { min, max },
    });
    const confirmed = confirmWorkspaceMutation(res, 'Falha ao atualizar jitter do workspace.');
    invalidateWorkspace();
    return confirmed;
  },
};
