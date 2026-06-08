import { apiFetch } from './core';

type MediaEnvelope<T> = { data?: T; error?: string | undefined; status: number };

function requireMediaResponse<T>(response: MediaEnvelope<T>, fallbackMessage: string) {
  if (response.error) {
    throw new Error(response.error);
  }
  if (response.status >= 400) {
    throw new Error(fallbackMessage);
  }
  return response;
}

function requireStringField(data: unknown, field: string, message: string) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(message);
  }
  const value = (data as Record<string, unknown>)[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(message);
  }
}

export const videoApi = {
  create: async (inputUrl: string, prompt: string) => {
    const res = requireMediaResponse(
      await apiFetch<{ id: string; status: string }>('/video/create', {
        method: 'POST',
        body: { inputUrl, prompt },
      }),
      'Falha ao criar video.',
    );
    requireStringField(res.data, 'id', 'Video job nao foi confirmado.');
    return res;
  },

  getJob: (id: string) =>
    apiFetch<{
      id: string;
      status: string;
      outputUrl?: string;
      prompt?: string;
      createdAt: string;
    }>(`/video/job/${encodeURIComponent(id)}`),
};

export interface VoiceProfile {
  id: string;
  name: string;
  provider?: string;
  voiceId?: string;
  settings?: Record<string, unknown>;
  createdAt?: string;
}

export const voiceApi = {
  createProfile: async (data: {
    name: string;
    provider: string;
    voiceId: string;
    settings?: Record<string, unknown>;
  }) => {
    const res = requireMediaResponse(
      await apiFetch<VoiceProfile>('/voice/profiles', {
        method: 'POST',
        body: data,
      }),
      'Falha ao criar perfil de voz.',
    );
    requireStringField(res.data, 'id', 'Perfil de voz nao foi confirmado.');
    return res;
  },

  listProfiles: (workspaceId?: string) => {
    const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
    return apiFetch<VoiceProfile[] | { profiles: VoiceProfile[] }>(`/voice/profiles${qs}`);
  },

  generate: async (data: {
    text: string;
    voiceProfileId?: string;
    voiceId?: string;
    provider?: string;
  }) => {
    const res = requireMediaResponse(
      await apiFetch<{ id: string; status: string; audioUrl?: string; duration?: number }>(
        '/voice/generate',
        {
          method: 'POST',
          body: data,
        },
      ),
      'Falha ao gerar audio.',
    );
    requireStringField(res.data, 'id', 'Job de audio nao foi confirmado.');
    return res;
  },
};

export const mediaApi = {
  processVideo: async (data: {
    imageUrl: string;
    prompt?: string;
    workspaceId?: string;
  }) => {
    const res = requireMediaResponse(
      await apiFetch<{ id: string; status: string }>('/media/video', {
        method: 'POST',
        body: data,
      }),
      'Falha ao processar midia.',
    );
    requireStringField(res.data, 'id', 'Media job nao foi confirmado.');
    return res;
  },

  getJob: (id: string) =>
    apiFetch<{ id: string; status: string; outputUrl?: string; createdAt: string }>(
      `/media/job/${encodeURIComponent(id)}`,
    ),
};
