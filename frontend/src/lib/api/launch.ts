import { apiFetch } from './core';

export interface LauncherGroup {
  id: string;
  name?: string | undefined;
  inviteLink?: string | undefined;
  groupLink?: string | undefined;
  capacity?: number | undefined;
  current?: number | undefined;
  isActive?: boolean | undefined;
}

export interface Launcher {
  id: string;
  name: string;
  slug?: string | undefined;
  description?: string | undefined;
  createdAt: string;
  groups?: LauncherGroup[] | undefined;
}

export type LauncherListPayload = Launcher[] | { launchers?: Launcher[]; data?: Launcher[] };

type LaunchApiEnvelope<T> = {
  data?: T | undefined;
  error?: string | undefined;
  status: number;
};

function confirmLaunchPayload<T>(
  response: LaunchApiEnvelope<T>,
  fallbackMessage: string,
  missingPayloadMessage: string,
): LaunchApiEnvelope<T> {
  if (response.error || response.status >= 400) {
    throw new Error(response.error ?? fallbackMessage);
  }

  if (response.data === undefined || response.data === null) {
    throw new Error(missingPayloadMessage);
  }

  return response;
}

export const launchApi = {
  async listLaunchers() {
    const response = await apiFetch<LauncherListPayload>('/launch/launchers');
    return confirmLaunchPayload(
      response,
      'Erro ao carregar launchers',
      'Launchpad list did not return a confirmed payload',
    );
  },

  async createLauncher(data: { name: string; description?: string; [key: string]: unknown }) {
    const response = await apiFetch<Launcher>('/launch/launcher', {
      method: 'POST',
      body: data,
    });
    return confirmLaunchPayload(
      response,
      'Erro ao criar launcher',
      'Launcher creation did not return a confirmed payload',
    );
  },

  async addGroups(launcherId: string, data: { groupLink: string; [key: string]: unknown }) {
    const response = await apiFetch<LauncherGroup>(
      `/launch/launcher/${encodeURIComponent(launcherId)}/groups`,
      {
        method: 'POST',
        body: data,
      },
    );
    return confirmLaunchPayload(
      response,
      'Erro ao adicionar grupo',
      'Launcher group addition did not return a confirmed payload',
    );
  },
};
