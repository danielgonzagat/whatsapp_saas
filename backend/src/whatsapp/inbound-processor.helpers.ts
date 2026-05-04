/**
 * Pure helpers extracted from InboundProcessorService.
 *
 * Extracted to keep the service under the architecture line-count guardrail
 * and to make these stateless utilities easy to unit-test without spinning
 * up the NestJS injector.
 */

const DIGITS_RE = /\D/g;

type InboundMessageType = 'text' | 'audio' | 'image' | 'document' | 'video' | 'sticker' | 'unknown';

/**
 * Strip non-digit characters and WhatsApp JID suffixes from a phone string,
 * returning the pure digit sequence (e.g. "+55 (11) 99999-9999@c.us" →
 * "5511999999999").
 */
export function normalizePhone(phone: string): string {
  return phone.replace(DIGITS_RE, '').replace('@c.us', '').replace('@s.whatsapp.net', '');
}

/**
 * Expand a phone into the Brazilian variants we treat as equivalent (with
 * and without the country code) so callers can compare loose user input
 * against canonical session phones.
 */
export function expandComparablePhoneVariants(phone: string): string[] {
  const digits = normalizePhone(phone);
  if (!digits) {
    return [];
  }

  const variants = new Set<string>([digits]);
  if (digits.startsWith('55') && digits.length > 11) {
    variants.add(digits.slice(2));
  }
  if (!digits.startsWith('55') && digits.length >= 10 && digits.length <= 11) {
    variants.add(`55${digits}`);
  }

  return Array.from(variants);
}

/**
 * True when two phones share at least one normalized variant. Used to detect
 * whether an inbound webhook came from the workspace's own number.
 */
export function areEquivalentPhones(left: string, right: string): boolean {
  const leftVariants = expandComparablePhoneVariants(left);
  const rightVariants = expandComparablePhoneVariants(right);
  return leftVariants.some((candidate) => rightVariants.includes(candidate));
}

/** Map an InboundMessage type to the DB enum string. */
export function mapMessageType(type: InboundMessageType): string {
  const typeMap: Record<string, string> = {
    text: 'TEXT',
    audio: 'AUDIO',
    image: 'IMAGE',
    video: 'VIDEO',
    document: 'DOCUMENT',
    sticker: 'STICKER',
    unknown: 'TEXT',
  };
  return typeMap[type] || 'TEXT';
}

/** Fallback message content rendered when media arrives without a caption. */
export function getDefaultContent(type: InboundMessageType): string {
  const contentMap: Record<string, string> = {
    audio: '[Áudio recebido - transcrição pendente]',
    image: '[Imagem recebida]',
    video: '[Vídeo recebido]',
    document: '[Documento recebido]',
    sticker: '[Sticker recebido]',
    unknown: '[Mídia recebida]',
  };
  return contentMap[type] || '';
}
