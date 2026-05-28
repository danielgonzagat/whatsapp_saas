/**
 * Pure helper functions for {@link UnifiedAgentActionsMessagingService}.
 *
 * Extracted from `unified-agent-actions-messaging.service.ts` to keep the
 * orchestrating service focused on side-effects (transport, audio, gmail)
 * while the deterministic input shaping lives here. All functions in this
 * module MUST stay stateless and free of NestJS DI / network access so
 * they can be exercised by fast unit tests.
 */import type { ChannelName } from './channel-transport.types';
import type { UnknownRecord } from '../common/types';export type ComplianceMode = 'reactive' | 'proactive';

export type WhatsAppSendMediaType = 'document' | 'image' | 'audio' | 'video';/**
 * Index-signature keeps the historic compatibility with
 * {@link IWhatsappMessaging.sendMessage} which accepts `Record<string, unknown>`.
 */
export interface WhatsAppSendOptions {
  mediaUrl?: string;
  mediaType?: WhatsAppSendMediaType;
  caption?: string;
  externalId?: string;
  complianceMode: ComplianceMode;
  forceDirect: boolean;
  quotedMessageId?: string;
  [key: string]: unknown;
}/** Type guard for plain object records. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}/**
 * Coerce primitive scalars to string; everything else falls back.
 * Mirrors the historic `readText` behaviour from the messaging service.
 */
export function readText(value: unknown, fallback = ''): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return fallback;
}/** Trim + return undefined when blank — used to skip empty optional fields. */
export function readOptionalText(value: unknown): string | undefined {
  const normalized = readText(value).trim();
  return normalized || undefined;
}/**
 * Lighter coercion used by tool args (`str(args.message)`).
 *
 * Differs from {@link readText} in two ways:
 *  - does not coerce bigint (tool args never carry bigint);
 *  - keeps the historic ternary shape so existing call sites do not change.
 */
export function coerceStr(value: unknown, fallback = ''): string {
  return typeof value === 'string'
    ? value
    : typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : fallback;
}/** Reactive when explicitly tagged in context; defaults to proactive otherwise. */
export function resolveComplianceMode(context?: UnknownRecord): ComplianceMode {
  return context?.deliveryMode === 'reactive' ? 'reactive' : 'proactive';
}/** Resolve outbound channel; falls back to whatsapp on missing/unknown values. */
export function resolveChannel(context?: UnknownRecord): ChannelName {
  const rawChannel =
    readOptionalText(context?.channel) ||
    readOptionalText(context?.sourceChannel) ||
    readOptionalText(context?.provider);
  const channel = rawChannel?.toLowerCase();
  if (
    channel === 'instagram' ||
    channel === 'messenger' ||
    channel === 'tiktok' ||
    channel === 'email' ||
    channel === 'whatsapp'
  ) {
    return channel;
  }
  return 'whatsapp';
}/**
 * Compose the option bag passed to WhatsApp/transport send calls.
 *
 * Keeps the omit-when-undefined shape so downstream layers can spread the
 * result without ending up with `mediaUrl: undefined` etc.
 */
export function buildWhatsAppSendOptions(
  context?: UnknownRecord,
  extra: UnknownRecord = {},
): WhatsAppSendOptions {
  const extraRecord = isRecord(extra) ? extra : {};
  const mediaType = readOptionalText(extraRecord.mediaType);
  const quotedMessageId =
    readOptionalText(extraRecord.quotedMessageId) ||
    readOptionalText(context?.quotedMessageId) ||
    readOptionalText(context?.providerMessageId);

  const resolvedMediaUrl = readOptionalText(extraRecord.mediaUrl);
  const resolvedMediaType: WhatsAppSendMediaType | undefined =
    mediaType === 'document' ||
    mediaType === 'image' ||
    mediaType === 'audio' ||
    mediaType === 'video'
      ? mediaType
      : undefined;
  const resolvedCaption = readOptionalText(extraRecord.caption);
  const resolvedExternalId = readOptionalText(extraRecord.externalId);

  return {
    ...(resolvedMediaUrl !== undefined ? { mediaUrl: resolvedMediaUrl } : {}),
    ...(resolvedMediaType !== undefined ? { mediaType: resolvedMediaType } : {}),
    ...(resolvedCaption !== undefined ? { caption: resolvedCaption } : {}),
    ...(resolvedExternalId !== undefined ? { externalId: resolvedExternalId } : {}),
    ...(quotedMessageId !== undefined ? { quotedMessageId } : {}),
    complianceMode: resolveComplianceMode(context),
    forceDirect: context?.forceDirect === true,
  };
}/** Minimal HTML escape for Gmail HTML bodies (subset Gmail expects). */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}