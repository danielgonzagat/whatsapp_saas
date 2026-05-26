import { NON_DIGIT_RE } from '../common/phone';

/**
 * Build the `text` field content for a WhatsApp text message.
 * Ensures body is never empty (Meta rejects empty text bodies).
 */
export function buildTextMessageContent(message: string): { body: string; preview_url: boolean } {
  return {
    body: String(message || '').trim() || ' ',
    preview_url: false,
  };
}

/**
 * Build the media-type field content for a WhatsApp media message.
 * Attaches an optional caption (suppressed for audio).
 */
export function buildMediaMessageContent(
  mediaUrl: string,
  type: 'image' | 'video' | 'audio' | 'document',
  caption?: string,
): Record<string, unknown> {
  const content: Record<string, unknown> = {
    link: String(mediaUrl || '').trim(),
  };
  if (caption && type !== 'audio') {
    content.caption = caption;
  }
  return content;
}

/**
 * Extract the WhatsApp message ID from a Meta Graph API POST response.
 * Meta returns the ID in several shapes:
 *   - { messages: [{ id }] }
 *   - { message_id: "..." }
 *   - { id: "..." }
 */
export function parseMessageIdFromResponse(
  response: Record<string, unknown>,
): string | null {
  const msgs = Array.isArray(response.messages)
    ? (response.messages as Array<Record<string, unknown>>)
    : null;
  return (
    (msgs && msgs.length > 0 && msgs[0] && typeof msgs[0].id === 'string' ? msgs[0].id : null) ||
    (typeof response.message_id === 'string' ? response.message_id : null) ||
    (typeof response.id === 'string' ? response.id : null) ||
    null
  );
}

/**
 * Strip non-digit characters from a phone number.
 * Canonical alias for the private normalizePhone in MetaWhatsAppService.
 */
export function normalizeWhatsAppPhone(value: string): string {
  return String(value || '').replace(NON_DIGIT_RE, '');
}
