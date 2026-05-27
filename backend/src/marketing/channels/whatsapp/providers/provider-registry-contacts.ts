/**
 * Contacts, chats, and health diagnostics for WhatsApp provider registry.
 *
 * Cohesion: all read/observe operations that interact with contacts,
 * chats, presence, and provider health. Each function follows the same
 * WAHA-first delegation pattern: check isWahaMode(), delegate to WAHA
 * or Meta Cloud provider. WAHA does not support presence/typing APIs
 * (no-op). getSessionDiagnostics enriches raw provider diagnostics
 * with the resolved session status via injected getSessionStatus.
 */

import { WahaProvider } from './waha.provider';
import { WhatsAppApiProvider } from './whatsapp-api.provider';
import type { SessionStatus } from './provider-registry.types';

export interface ContactsDeps {
  isWahaMode: () => boolean;
  wahaProvider: WahaProvider | undefined;
  metaCloudProvider: WhatsAppApiProvider;
  getSessionStatus: (workspaceId: string) => Promise<SessionStatus>;
}

export async function isRegistered(
  deps: ContactsDeps,
  workspaceId: string,
  phone: string,
): Promise<boolean> {
  if (deps.isWahaMode() && deps.wahaProvider) {
    return deps.wahaProvider.isRegisteredUser(workspaceId, phone);
  }
  return deps.metaCloudProvider.isRegisteredUser(workspaceId, phone);
}

export async function getClientInfo(deps: ContactsDeps, workspaceId: string): Promise<unknown> {
  if (deps.isWahaMode() && deps.wahaProvider) {
    return deps.wahaProvider.getClientInfo(workspaceId);
  }
  return deps.metaCloudProvider.getClientInfo(workspaceId);
}

export async function getContacts(deps: ContactsDeps, workspaceId: string): Promise<unknown[]> {
  if (deps.isWahaMode() && deps.wahaProvider) {
    const contacts = await deps.wahaProvider.getContacts(workspaceId);
    return Array.isArray(contacts) ? contacts : [];
  }
  const contacts = await deps.metaCloudProvider.getContacts(workspaceId);
  return Array.isArray(contacts) ? contacts : [];
}

export async function upsertContactProfile(
  deps: ContactsDeps,
  workspaceId: string,
  contact: { phone: string; name?: string | null },
): Promise<boolean> {
  if (deps.isWahaMode() && deps.wahaProvider) {
    return deps.wahaProvider.upsertContactProfile(workspaceId, contact);
  }
  return deps.metaCloudProvider.upsertContactProfile(workspaceId, contact);
}

export async function getChats(deps: ContactsDeps, workspaceId: string): Promise<unknown[]> {
  if (deps.isWahaMode() && deps.wahaProvider) {
    const chats = await deps.wahaProvider.getChats(workspaceId);
    return Array.isArray(chats) ? chats : [];
  }
  const chats = await deps.metaCloudProvider.getChats(workspaceId);
  return Array.isArray(chats) ? chats : [];
}

export async function getChatMessages(
  deps: ContactsDeps,
  workspaceId: string,
  chatId: string,
  options?: { limit?: number; offset?: number; downloadMedia?: boolean },
): Promise<unknown[]> {
  if (deps.isWahaMode() && deps.wahaProvider) {
    const msgs = await deps.wahaProvider.getChatMessages(workspaceId, chatId, options);
    return Array.isArray(msgs) ? msgs : [];
  }
  const msgs = await deps.metaCloudProvider.getChatMessages(workspaceId, chatId, options);
  return Array.isArray(msgs) ? msgs : [];
}

export async function readChatMessages(
  deps: ContactsDeps,
  workspaceId: string,
  chatId: string,
): Promise<void> {
  if (deps.isWahaMode() && deps.wahaProvider) {
    return deps.wahaProvider.sendSeen(workspaceId, chatId);
  }
  return deps.metaCloudProvider.readChatMessages(workspaceId, chatId);
}

export async function setPresence(
  deps: ContactsDeps,
  workspaceId: string,
  presence: 'available' | 'offline',
  chatId?: string,
): Promise<void> {
  if (deps.isWahaMode()) {
    return;
  }
  return deps.metaCloudProvider.setPresence(workspaceId, presence, chatId);
}

export async function sendTyping(
  deps: ContactsDeps,
  workspaceId: string,
  chatId: string,
): Promise<void> {
  if (deps.isWahaMode()) {
    return;
  }
  return deps.metaCloudProvider.sendTyping(workspaceId, chatId);
}

export async function stopTyping(
  deps: ContactsDeps,
  workspaceId: string,
  chatId: string,
): Promise<void> {
  if (deps.isWahaMode()) {
    return;
  }
  return deps.metaCloudProvider.stopTyping(workspaceId, chatId);
}

export async function sendSeen(
  deps: ContactsDeps,
  workspaceId: string,
  chatId: string,
): Promise<void> {
  if (deps.isWahaMode() && deps.wahaProvider) {
    return deps.wahaProvider.sendSeen(workspaceId, chatId);
  }
  return deps.metaCloudProvider.sendSeen(workspaceId, chatId);
}

export async function healthCheck(
  deps: ContactsDeps,
): Promise<{ whatsappApi: boolean; whatsappWebAgent: boolean }> {
  if (deps.isWahaMode() && deps.wahaProvider) {
    const wahaHealthy = await deps.wahaProvider.ping().catch(() => false);
    return { whatsappApi: wahaHealthy, whatsappWebAgent: false };
  }
  return {
    whatsappApi: await deps.metaCloudProvider.ping(),
    whatsappWebAgent: false,
  };
}

export async function getSessionDiagnostics(
  deps: ContactsDeps,
  workspaceId: string,
): Promise<Record<string, unknown>> {
  if (deps.isWahaMode() && deps.wahaProvider) {
    const diag = await deps.wahaProvider.getSessionConfigDiagnostics(workspaceId);
    return {
      ...diag,
      providerType: 'whatsapp-api',
      status: await deps.getSessionStatus(workspaceId),
    };
  }
  const diagnostics = await deps.metaCloudProvider.getSessionConfigDiagnostics(workspaceId);
  return {
    ...diagnostics,
    providerType: 'meta-cloud',
    status: await deps.getSessionStatus(workspaceId),
  };
}

export async function listLidMappings(
  deps: ContactsDeps,
  workspaceId: string,
): Promise<Array<{ lid: string; pn: string }>> {
  if (deps.isWahaMode() && deps.wahaProvider) {
    return deps.wahaProvider.listLidMappings(workspaceId);
  }
  return deps.metaCloudProvider.listLidMappings(workspaceId);
}
