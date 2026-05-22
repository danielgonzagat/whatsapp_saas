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

export const launchApi = {
  listLaunchers: () => apiFetch<LauncherListPayload>('/launch/launchers'),

  createLauncher: (data: { name: string; description?: string; [key: string]: unknown }) =>
    apiFetch<Launcher>('/launch/launcher', {
      method: 'POST',
      body: data,
    }),

  addGroups: (launcherId: string, data: { groupLink: string; [key: string]: unknown }) =>
    apiFetch<{ id: string; groupLink: string }>(
      `/launch/launcher/${encodeURIComponent(launcherId)}/groups`,
      {
        method: 'POST',
        body: data,
      },
    ),
};
