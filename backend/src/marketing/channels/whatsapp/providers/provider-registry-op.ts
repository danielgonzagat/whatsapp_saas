/**
 * Session lifecycle operations for WhatsApp provider registry.
 *
 * Cohesion: disconnect, logout, restartSession, deleteSession, and
 * syncSessionConfig are provider-agnostic session lifecycle operations.
 * All delegate to the canonical Meta Cloud provider. logout is a direct
 * alias for disconnect.
 */

import { WhatsAppApiProvider } from './whatsapp-api.provider';
import type { ProviderSessionSnapshot } from '../provider-settings.types';

export interface OpDeps {
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
  return deps.metaCloudProvider.restartSession(workspaceId);
}

export async function deleteSession(deps: OpDeps, workspaceId: string): Promise<boolean> {
  return deps.metaCloudProvider.deleteSession(workspaceId);
}

export async function syncSessionConfig(deps: OpDeps, workspaceId: string): Promise<void> {
  return deps.metaCloudProvider.syncSessionConfig(workspaceId);
}
