import { apiFetch } from './core';

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

export interface VoiceProfile {
  id: string;
  name: string;
  provider?: string;
  voiceId?: string;
  settings?: Record<string, unknown>;
  createdAt?: string;
}

export const voiceApi = {
  createProfile: (data: {
    name: string;
    provider?: string;
    voiceId?: string;
    settings?: Record<string, unknown>;
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
