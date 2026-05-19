import type { NormalizedMessage } from '../../inbox/omnichannel.helpers';
import type {
  GmailMailboxRecord,
  GmailMessagePart,
  GmailMessageResponse,
} from './types';

export function readHeader(
  headers: Array<{ name?: string; value?: string }>,
  wanted: string,
): string {
  const header = headers.find(
    (item) => item.name?.toLowerCase() === wanted.toLowerCase(),
  );
  return String(header?.value || '').trim();
}

export function parseFromHeader(raw: string): {
  name: string | null;
  email: string;
} {
  const match = raw.match(/^(?:"?([^"<]*)"?\s*)?<([^>]+)>$/);
  if (match) {
    return {
      name: String(match[1] || '').trim() || null,
      email: String(match[2] || '')
        .trim()
        .toLowerCase(),
    };
  }
  const emailOnly = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return {
    name: null,
    email: emailOnly ? emailOnly[0].toLowerCase() : '',
  };
}

export function decodeGmailBody(data: string): string {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf8').trim();
}

export function extractTextBody(part: GmailMessagePart | undefined): string {
  if (!part) {
    return '';
  }
  if (part.mimeType === 'text/plain' && part.body?.data) {
    return decodeGmailBody(part.body.data);
  }
  for (const child of part.parts || []) {
    const text = extractTextBody(child);
    if (text) {
      return text;
    }
  }
  if (part.mimeType === 'text/html' && part.body?.data) {
    return decodeGmailBody(part.body.data)
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return '';
}

export function normalizeGmailMessage(
  connection: GmailMailboxRecord,
  message: GmailMessageResponse,
): NormalizedMessage {
  const headers = message.payload?.headers || [];
  const fromRaw = readHeader(headers, 'from');
  const subject = readHeader(headers, 'subject');
  const parsedFrom = parseFromHeader(fromRaw);
  const bodyText = extractTextBody(message.payload) || message.snippet || '';

  const externalId = `gmail:${message.id || message.threadId || message.historyId || 'unknown'}`;
  const normalized: NormalizedMessage = {
    workspaceId: connection.workspaceId,
    channel: 'EMAIL' as const,
    externalId,
    from: parsedFrom.email || fromRaw || 'unknown-email',
    content: subject ? `Assunto: ${subject}\n\n${bodyText}` : bodyText,
    metadata: {
      provider: 'gmail',
      mailboxConnectionId: connection.id,
      mailboxEmail: connection.email,
      messageId: message.id || null,
      threadId: message.threadId || null,
      historyId: message.historyId || null,
      subject: subject || null,
    },
  };
  const fromNameVal =
    parsedFrom.name || parsedFrom.email || fromRaw || undefined;
  if (fromNameVal) {
    normalized.fromName = fromNameVal;
  }
  return normalized;
}
