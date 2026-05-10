import { apiFetch } from './core';

export interface ChannelSetupProduct {
  id: string;
  name: string;
  price?: number | null;
  active?: boolean;
  status?: string | null;
}

export interface ChannelSetupArsenal {
  assetId: string;
  type: string;
  label?: string | null;
  storageRef: string;
  uploadedAt?: string;
}

export interface ChannelSetupConfig {
  tone: string;
  aggressiveness: string;
  businessHours: Record<string, unknown>;
  followupEnabled: boolean;
  dailyMessageLimit: number;
  transferCriteria: Record<string, unknown>;
  language: string;
}

export interface ChannelSetupState {
  channel: string;
  completed: boolean;
  products: ChannelSetupProduct[];
  selectedProductIds: string[];
  arsenal: ChannelSetupArsenal[];
  config: ChannelSetupConfig | null;
}

function payload<T>(response: { data?: T }): T {
  return (response.data ?? response) as T;
}

export async function getChannelSetup(channel: string): Promise<ChannelSetupState> {
  return payload(await apiFetch<ChannelSetupState>(`/channel-setup/${channel}`));
}

export async function saveChannelProducts(channel: string, productIds: string[]) {
  return payload(
    await apiFetch<ChannelSetupState>(`/channel-setup/${channel}/products`, {
      method: 'POST',
      body: { productIds },
    }),
  );
}

export async function addChannelArsenal(
  channel: string,
  asset: { type: string; label?: string; storageRef: string },
) {
  return payload(
    await apiFetch<ChannelSetupState>(`/channel-setup/${channel}/arsenal`, {
      method: 'POST',
      body: asset,
    }),
  );
}

export async function removeChannelArsenal(channel: string, assetId: string) {
  return payload(
    await apiFetch<ChannelSetupState>(`/channel-setup/${channel}/arsenal/${assetId}`, {
      method: 'DELETE',
    }),
  );
}

export async function saveChannelConfig(channel: string, config: Partial<ChannelSetupConfig>) {
  return payload(
    await apiFetch<ChannelSetupState>(`/channel-setup/${channel}/config`, {
      method: 'POST',
      body: config,
    }),
  );
}

export async function completeChannelSetup(channel: string) {
  return payload(
    await apiFetch<ChannelSetupState>(`/channel-setup/${channel}/complete`, {
      method: 'POST',
    }),
  );
}

export async function reconfigureChannelSetup(channel: string) {
  return payload(
    await apiFetch<ChannelSetupState>(`/channel-setup/${channel}/reconfigure`, {
      method: 'POST',
    }),
  );
}
