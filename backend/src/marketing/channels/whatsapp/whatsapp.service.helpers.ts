import { readText } from '../../../common/utils';
import { isPlaceholderContactName as isPlaceholderName } from './whatsapp-normalization.util';
import { normalizeNumber } from './whatsapp-service.helpers';

/**
 * Check whether a chat ID string represents an individual (1:1) chat,
 * as opposed to a group, broadcast list, or newsletter.
 */
export function isIndividualChatId(c?: string | null): boolean {
  const v = String(c || '').trim();
  return v.endsWith('@c.us') || v.endsWith('@s.whatsapp.net');
}

/**
 * Determine whether a contact name value is a WhatsApp-generated placeholder
 * (e.g. phone-number-derived names like "5511999991111 doe").
 *
 * Delegates to the canonical {@link isPlaceholderName} from
 * whatsapp-normalization.util.
 */
export function isPlaceholderContactName(v: unknown, p?: string | null): boolean {
  return isPlaceholderName(v, p);
}

/**
 * Walk a list of name candidates and return the first one that is non-empty
 * and not a WhatsApp-generated placeholder.
 *
 * Returns `''` when no trusted name is found.
 */
export function resolveTrustedContactName(phone: string, ...candidates: unknown[]): string {
  for (const c of candidates) {
    const n = readText(c);
    if (n && !isPlaceholderContactName(n, phone)) {
      return n;
    }
  }
  return '';
}

/**
 * Normalize a chat ID to the canonical `{digits}@c.us` form.
 *
 * If the value already contains `@` it is returned as-is;
 * otherwise the leading digits are extracted via {@link normalizeNumber}
 * and suffixed with `@c.us`.
 */
export function normalizeChatId(chatId: string): string {
  return String(chatId || '').includes('@') ? chatId : `${normalizeNumber(chatId)}@c.us`;
}
