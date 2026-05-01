import { WahaProvider } from '../waha.provider';
import { WhatsAppApiProvider } from '../whatsapp-api.provider';

function isWaha(wahaProvider?: WahaProvider): boolean {
  return !!wahaProvider;
}

export async function companionReadChatMessages(
  workspaceId: string,
  chatId: string,
  metaCloudProvider: WhatsAppApiProvider,
  wahaProvider?: WahaProvider,
): Promise<void> {
  if (isWaha(wahaProvider)) {
    return wahaProvider.sendSeen(workspaceId, chatId);
  }
  return metaCloudProvider.readChatMessages(workspaceId, chatId);
}

export async function companionSetPresence(
  workspaceId: string,
  presence: 'available' | 'offline',
  chatId: string | undefined,
  metaCloudProvider: WhatsAppApiProvider,
  wahaProvider?: WahaProvider,
): Promise<void> {
  if (isWaha(wahaProvider)) {
    return;
  }
  return metaCloudProvider.setPresence(workspaceId, presence, chatId);
}

export async function companionSendTyping(
  workspaceId: string,
  chatId: string,
  metaCloudProvider: WhatsAppApiProvider,
  wahaProvider?: WahaProvider,
): Promise<void> {
  if (isWaha(wahaProvider)) {
    return;
  }
  return metaCloudProvider.sendTyping(workspaceId, chatId);
}

export async function companionStopTyping(
  workspaceId: string,
  chatId: string,
  metaCloudProvider: WhatsAppApiProvider,
  wahaProvider?: WahaProvider,
): Promise<void> {
  if (isWaha(wahaProvider)) {
    return;
  }
  return metaCloudProvider.stopTyping(workspaceId, chatId);
}

export async function companionSendSeen(
  workspaceId: string,
  chatId: string,
  metaCloudProvider: WhatsAppApiProvider,
  wahaProvider?: WahaProvider,
): Promise<void> {
  if (isWaha(wahaProvider)) {
    return wahaProvider.sendSeen(workspaceId, chatId);
  }
  return metaCloudProvider.sendSeen(workspaceId, chatId);
}
