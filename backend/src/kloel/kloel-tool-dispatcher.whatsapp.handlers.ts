/**
 * WhatsApp tool dispatch helpers extracted from KloelToolDispatcherService.
 *
 * Each `case` in the dispatcher's WhatsApp domain (connect/get/send/list/...)
 * is pure delegation to the {@link KloelWhatsAppToolsService}. To keep the
 * dispatcher under the LOC budget, the entire group is funnelled through
 * {@link dispatchWhatsAppTool}. Behaviour is preserved exactly: same tool
 * names, same arguments, same return shapes; `null` is returned when the
 * tool name is not part of the WhatsApp domain so the dispatcher can fall
 * through to the next case.
 */

import type { KloelWhatsAppToolsService } from './kloel-whatsapp-tools.service';
import type { UnknownRecord } from '../common/types';

type ToolResult = {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
};

/**
 * Tool names handled by {@link dispatchWhatsAppTool}. Kept in sync with the
 * dispatcher's switch cases so spec coverage on the dispatcher continues to
 * exercise this module.
 */
export const WHATSAPP_TOOL_NAMES = new Set<string>([
  'connect_whatsapp',
  'get_whatsapp_status',
  'send_whatsapp_message',
  'list_whatsapp_contacts',
  'list_whatsapp_chats',
  'get_whatsapp_messages',
  'get_whatsapp_backlog',
  'set_whatsapp_presence',
  'sync_whatsapp_history',
  'send_audio',
  'send_document',
  'send_voice_note',
  'transcribe_audio',
]);

export function isWhatsAppTool(toolName: string): boolean {
  return WHATSAPP_TOOL_NAMES.has(toolName);
}

/**
 * Dispatch a WhatsApp-domain tool. Returns `null` when the tool is not
 * recognised so the caller can fall through to the next dispatcher branch.
 *
 * Behaviour is preserved one-for-one with the previous inline switch cases.
 */
export async function dispatchWhatsAppTool(
  whatsappToolsService: KloelWhatsAppToolsService,
  workspaceId: string,
  toolName: string,
  args: UnknownRecord,
): Promise<ToolResult | null> {
  const asToolArgs = <T>(value: UnknownRecord): T => value as T;

  switch (toolName) {
    case 'connect_whatsapp':
      return await whatsappToolsService.toolConnectWhatsapp(workspaceId);
    case 'get_whatsapp_status':
      return await whatsappToolsService.toolGetWhatsAppStatus(workspaceId);
    case 'send_whatsapp_message':
      return await whatsappToolsService.toolSendWhatsAppMessage(workspaceId, asToolArgs(args));
    case 'list_whatsapp_contacts':
      return await whatsappToolsService.toolListWhatsAppContacts(workspaceId, asToolArgs(args));
    case 'list_whatsapp_chats':
      return await whatsappToolsService.toolListWhatsAppChats(workspaceId, asToolArgs(args));
    case 'get_whatsapp_messages':
      return await whatsappToolsService.toolGetWhatsAppMessages(workspaceId, asToolArgs(args));
    case 'get_whatsapp_backlog':
      return await whatsappToolsService.toolGetWhatsAppBacklog(workspaceId);
    case 'set_whatsapp_presence':
      return await whatsappToolsService.toolSetWhatsAppPresence(workspaceId, asToolArgs(args));
    case 'sync_whatsapp_history':
      return await whatsappToolsService.toolSyncWhatsAppHistory(workspaceId, asToolArgs(args));
    case 'send_audio':
      return await whatsappToolsService.toolSendAudio(workspaceId, asToolArgs(args));
    case 'send_document':
      return await whatsappToolsService.toolSendDocument(workspaceId, asToolArgs(args));
    case 'send_voice_note':
      return await whatsappToolsService.toolSendVoiceNote(workspaceId, asToolArgs(args));
    case 'transcribe_audio':
      return await whatsappToolsService.toolTranscribeAudio(workspaceId, asToolArgs(args));
    default:
      return null;
  }
}
