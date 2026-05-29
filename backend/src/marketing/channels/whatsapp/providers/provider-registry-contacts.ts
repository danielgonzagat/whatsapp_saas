/**
 * Contacts, chats, and health diagnostics for WhatsApp provider registry.
 *
 * Cohesion: all read/observe operations that interact with contacts,
 * chats, presence, and provider health. Each function delegates to the
 * canonical Meta Cloud provider. getSessionDiagnostics enriches raw
 * provider diagnostics with the resolved session status via injected
 * getSessionStatus.
 */

import { WhatsAppApiProvider } from './whatsapp-api.provider';
import type { SessionStatus } from './provider-registry.types';

export interface ContactsDeps {
  metaCloudProvider: WhatsAppApiProvider;
  getSessionStatus: (workspaceId: string) => Promise<SessionStatus>;
}

export async function isRegistered(
  deps: ContactsDeps,
  workspaceId: string,
  phone: string,
): Promise<boolean> {
  return deps.metaCloudProvider.isRegisteredUser(workspaceId, phone);
}

export async function getClientInfo(deps: ContactsDeps, workspaceId: string): Promise<unknown> {
  return deps.metaCloudProvider.getClientInfo(workspaceId);
}

export async function getContacts(deps: ContactsDeps, workspaceId: string): Promise<unknown[]> {
  const contacts = await deps.metaCloudProvider.getContacts(workspaceId);
  return Array.isArray(contacts) ? contacts : [];
}

export async function upsertContactProfile(
  deps: ContactsDeps,
  workspaceId: string,
  contact: { phone: string; name?: string | null },
): Promise<boolean> {
  return deps.metaCloudProvider.upsertContactProfile(workspaceId, contact);
}

export async function getChats(deps: ContactsDeps, workspaceId: string): Promise<unknown[]> {
  const chats = await deps.metaCloudProvider.getChats(workspaceId);
  return Array.isArray(chats) ? chats : [];
}

export async function getChatMessages(
  deps: ContactsDeps,
  workspaceId: string,
  chatId: string,
  options?: { limit?: number; offset?: number; downloadMedia?: boolean },
): Promise<unknown[]> {
  const msgs = await deps.metaCloudProvider.getChatMessages(workspaceId, chatId, options);
  return Array.isArray(msgs) ? msgs : [];
}

export async function readChatMessages(
  deps: ContactsDeps,
  workspaceId: string,
  chatId: string,
): Promise<void> {
  return deps.metaCloudProvider.readChatMessages(workspaceId, chatId);
}

export async function setPresence(
  deps: ContactsDeps,
  workspaceId: string,
  presence: 'available' | 'offline',
  chatId?: string,
): Promise<void> {
  return deps.metaCloudProvider.setPresence(workspaceId, presence, chatId);
}

export async function sendTyping(
  deps: ContactsDeps,
  workspaceId: string,
  chatId: string,
): Promise<void> {
  return deps.metaCloudProvider.sendTyping(workspaceId, chatId);
}

export async function stopTyping(
  deps: ContactsDeps,
  workspaceId: string,
  chatId: string,
): Promise<void> {
  return deps.metaCloudProvider.stopTyping(workspaceId, chatId);
}

export async function sendSeen(
  deps: ContactsDeps,
  workspaceId: string,
  chatId: string,
): Promise<void> {
  return deps.metaCloudProvider.sendSeen(workspaceId, chatId);
}

export async function healthCheck(
  deps: ContactsDeps,
): Promise<{ whatsappApi: boolean; whatsappWebAgent: boolean }> {
  return {
    whatsappApi: await deps.metaCloudProvider.ping(),
    whatsappWebAgent: false,
  };
}

export async function getSessionDiagnostics(
  deps: ContactsDeps,
  workspaceId: string,
): Promise<Record<string, unknown>> {
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
  return deps.metaCloudProvider.listLidMappings(workspaceId);
}
