import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { escapeHtml } from './html-escape.util';
import { generateUnsubscribeToken } from './unsubscribe-token.util';

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

const FOOTER_TEMPLATE_PATH = join(
  __dirname,
  '..',
  '..',
  'campaigns',
  'templates',
  'unsubscribe-footer.html',
);

const UNSUBSCRIBE_FOOTER_TEMPLATE = readFileSync(FOOTER_TEMPLATE_PATH, 'utf8');

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://kloel.com';

function renderUnsubscribeFooter(unsubscribeUrl: string): string {
  return UNSUBSCRIBE_FOOTER_TEMPLATE.replace(PLACEHOLDER_RE, (_match, key: string) => {
    if (key === 'unsubscribeUrl') {
      return escapeHtml(unsubscribeUrl);
    }
    return '';
  });
}

export interface UnsubscribeUrlOptions {
  email: string;
  workspaceId?: string;
  campaignId?: string;
}

/** Generate the full unsubscribe URL for a marketing email. */
export function buildUnsubscribeUrl(opts: UnsubscribeUrlOptions): string {
  const token = generateUnsubscribeToken({
    email: opts.email,
    workspaceId: opts.workspaceId,
    campaignId: opts.campaignId,
  });
  return `${FRONTEND_URL}/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** Generate the unsubscribe footer HTML fragment to append to marketing emails. */
export function buildUnsubscribeFooterHtml(opts: UnsubscribeUrlOptions): string {
  return renderUnsubscribeFooter(buildUnsubscribeUrl(opts));
}

/** One-click unsubscribe mailto address per RFC 8058 / RFC 2369. */
export function buildListUnsubscribeMailto(email: string): string {
  const token = generateUnsubscribeToken({ email });
  return `<mailto:${process.env.EMAIL_FROM || 'noreply@kloel.com'}?subject=unsubscribe&body=token:${encodeURIComponent(token)}>`;
}

/**
 * Build the List-Unsubscribe header value per RFC 8058.
 * Returns a URL for one-click POST unsubscribe via the backend endpoint,
 * plus a mailto fallback for clients that don't support HTTPS POST unsubscribe.
 */
export function buildListUnsubscribeHeader(email: string): string {
  const apiUrl = process.env.API_URL || FRONTEND_URL;
  const token = generateUnsubscribeToken({ email });
  const postUrl = `${apiUrl}/unsubscribe`;
  return `<${postUrl}>, <mailto:${process.env.EMAIL_FROM || 'noreply@kloel.com'}?subject=unsubscribe&body=token:${encodeURIComponent(token)}>`;
}
