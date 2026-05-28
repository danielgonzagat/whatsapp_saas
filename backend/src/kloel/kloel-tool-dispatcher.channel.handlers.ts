/**
 * Channel send-tool dispatch helpers extracted from KloelToolDispatcherService.
 *
 * Exposes email, Instagram DM, and Messenger send tools to the chat dispatcher
 * with RiskGate gating before every outbound delivery.
 *
 * TikTok is intentionally absent — the TikTok Business Messaging API does not
 * support programmatic outbound send (inbound webhook only).
 *
 * Each case:
 *   1. Evaluates RiskGateService.gateMessageSend()
 *   2. Blocks on verdict === 'block'
 *   3. Delegates to ChannelTransportRegistry.send() otherwise
 *
 * Behaviour matches the dispatchWhatsAppTool pattern: same tool names,
 * same return shapes; `null` is returned when the tool name is not part of
 * this domain so the dispatcher can fall through to the next branch.
 */

import type { RiskGateService } from './risk-class/risk-gate.service';
import type { ChannelTransportRegistry } from './channel-transport.registry';
import type { ChannelSendRequest, ChannelSendResult } from './channel-transport.types';
import type { UnknownRecord } from '../common/types';type ToolResult = {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
};/**
 * Tool names handled by {@link dispatchChannelTool}. Kept in sync with
 * {@link KLOEL_CHAT_TOOLS_CORE} definitions in kloel-chat-tools.definition.ts.
 */
export const CHANNEL_TOOL_NAMES = new Set<string>([
  'send_email',
  'send_instagram_dm',
  'send_messenger_message',
]);export function isChannelTool(toolName: string): boolean {
  return CHANNEL_TOOL_NAMES.has(toolName);
}/** Dependencies required by the channel dispatcher. */
export interface ChannelToolDeps {
  transports: ChannelTransportRegistry;
  riskGate: RiskGateService;
}/** Map a ChannelSendResult into a ToolResult-compatible plain object. */
function adaptResult(sendResult: ChannelSendResult): ToolResult {
  const out: ToolResult = { success: sendResult.success };
  if (sendResult.messageId !== undefined) out.messageId = sendResult.messageId;
  if (sendResult.error !== undefined) out.error = sendResult.error;
  return out;
}/**
 * Extract a string value from `args` by trying `primaryKey` first,
 * then falling back to `fallbackKey`. Returns `undefined` when neither
 * key yields a non-empty string.
 */
function extractStringArg(
  args: UnknownRecord,
  primaryKey: string,
  fallbackKey?: string,
): string | undefined {
  const primary = args[primaryKey];
  if (typeof primary === 'string' && primary.trim().length > 0) {
    return primary.trim();
  }
  if (fallbackKey !== undefined) {
    const fallback = args[fallbackKey];
    if (typeof fallback === 'string' && fallback.trim().length > 0) {
      return fallback.trim();
    }
  }
  return undefined;
}export async function dispatchChannelTool(
  deps: ChannelToolDeps,
  workspaceId: string,
  toolName: string,
  args: UnknownRecord,
): Promise<ToolResult | null> {
  const { transports, riskGate } = deps;

  switch (toolName) {
    case 'send_email': {
      const email = extractStringArg(args, 'email', 'to');
      const message = extractStringArg(args, 'message', 'body');
      if (!email) return { success: false, error: 'email_required' };
      if (!message) return { success: false, error: 'message_required' };

      const gate = riskGate.gateMessageSend({ target: 'lead' });
      if (gate.verdict === 'block') {
        return { success: false, error: gate.reason };
      }

      const request: ChannelSendRequest = {
        workspaceId,
        channel: 'email',
        recipientId: email,
        content: message,
      };
      return adaptResult(await transports.send(workspaceId, request));
    }

    case 'send_instagram_dm': {
      const handle = extractStringArg(args, 'handle', 'instagramUserId');
      const message = extractStringArg(args, 'message');
      if (!handle) return { success: false, error: 'instagram_handle_required' };
      if (!message) return { success: false, error: 'message_required' };

      const gate = riskGate.gateMessageSend({ target: 'lead' });
      if (gate.verdict === 'block') {
        return { success: false, error: gate.reason };
      }

      const request: ChannelSendRequest = {
        workspaceId,
        channel: 'instagram',
        recipientId: handle,
        content: message,
      };
      return adaptResult(await transports.send(workspaceId, request));
    }

    case 'send_messenger_message': {
      const recipientId = extractStringArg(args, 'recipientId');
      const message = extractStringArg(args, 'message');
      if (!recipientId) return { success: false, error: 'recipient_id_required' };
      if (!message) return { success: false, error: 'message_required' };

      const gate = riskGate.gateMessageSend({ target: 'lead' });
      if (gate.verdict === 'block') {
        return { success: false, error: gate.reason };
      }

      const request: ChannelSendRequest = {
        workspaceId,
        channel: 'messenger',
        recipientId,
        content: message,
      };
      return adaptResult(await transports.send(workspaceId, request));
    }

    default:
      return null;
  }
}