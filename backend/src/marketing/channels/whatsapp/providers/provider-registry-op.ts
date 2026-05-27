/**
 * Session lifecycle operations for WhatsApp provider registry.
 *
 * Cohesion: disconnect, logout, restartSession, deleteSession, and
 * syncSessionConfig are provider-agnostic session lifecycle operations.
 * They follow the same pattern: check isWahaMode(), delegate to the
 * active provider (WAHA or Meta Cloud), and optionally persist state.
 * logout is a direct alias for disconnect.
 */

import { WahaProvider } from './waha.provider';
import { WhatsAppApiProvider } from './whatsapp-api.provider';
import type { ProviderSessionSnapshot } from '../provider-settings.types';

export interface OpDeps {
  isWahaMode: () => boolean;
  wahaProvider: WahaProvider | undefined;
  metaCloudProvider: WhatsAppApiProvider;
  persistSessionSnapshot: (
    workspaceId: string,
    update: Partial<ProviderSessionSnapshot>,
  ) => Promise<void>;
}

export async function disconnect(
  deps: OpDeps,
  workspaceId: string,
): Promise<{ success: boolean; message?: string }> {
  if (deps.isWahaMode() && deps.wahaProvider) {
    const result = await deps.wahaProvider.logoutSession(workspaceId);
    await deps.persistSessionSnapshot(workspaceId, { status: 'disconnected', qrCode: null });
    return { success: Boolean(result?.success), message: 'disconnected' };
  }
  await deps.persistSessionSnapshot(workspaceId, { status: 'disconnected', qrCode: null });
  return { success: true, message: 'disconnected' };
}

export async function logout(
  deps: OpDeps,
  workspaceId: string,
): Promise<{ success: boolean; message?: string }> {
  return disconnect(deps, workspaceId);
}

export async function restartSession(
  deps: OpDeps,
  workspaceId: string,
): Promise<{ success: boolean; message?: string; qrCode?: string; authUrl?: string }> {
  if (deps.isWahaMode() && deps.wahaProvider) {
    return deps.wahaProvider.restartSession(workspaceId);
  }
  return deps.metaCloudProvider.restartSession(workspaceId);
}

export async function deleteSession(deps: OpDeps, workspaceId: string): Promise<boolean> {
  if (deps.isWahaMode() && deps.wahaProvider) {
    return deps.wahaProvider.deleteSession(workspaceId);
  }
  return deps.metaCloudProvider.deleteSession(workspaceId);
}

export async function syncSessionConfig(deps: OpDeps, workspaceId: string): Promise<void> {
  if (deps.isWahaMode() && deps.wahaProvider) {
    return deps.wahaProvider.syncSessionConfig(workspaceId);
  }
  return deps.metaCloudProvider.syncSessionConfig(workspaceId);
}
