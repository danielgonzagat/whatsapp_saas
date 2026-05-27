import {
  buildListUnsubscribeHeader,
  buildUnsubscribeFooterHtml,
} from '../common/utils/unsubscribe-footer.util';

import { NAME_RE } from '../common/regex';

export function resolveEmailMarketingProvider(): 'resend' | 'sendgrid' | 'smtp' | 'log' {
  if (process.env.RESEND_API_KEY) {
    return 'resend';
  }
  if (process.env.SENDGRID_API_KEY) {
    return 'sendgrid';
  }
  if (process.env.SMTP_HOST) {
    return 'smtp';
  }
  return 'log';
}

export function buildCampaignEmail(input: {
  htmlBody: string;
  subject: string;
  recipientEmail: string;
  recipientName: string | null;
  workspaceId: string;
}) {
  const personalizedHtml = input.htmlBody.replace(NAME_RE, input.recipientName || 'Cliente');
  const footerHtml = buildUnsubscribeFooterHtml({
    email: input.recipientEmail,
    workspaceId: input.workspaceId,
  });
  const listUnsubscribe = buildListUnsubscribeHeader({
    email: input.recipientEmail,
    workspaceId: input.workspaceId,
  });
  const headers: Record<string, string> = {};
  if (listUnsubscribe) {
    headers['List-Unsubscribe'] = listUnsubscribe;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }
  return {
    to: input.recipientEmail,
    subject: input.subject,
    html: `${personalizedHtml}${footerHtml}`,
    headers,
  };
}

export function buildCampaignStatUpdate(
  event: string,
): Partial<Record<string, { increment: number }>> | null {
  switch (event) {
    case 'DELIVERED':
      return { deliveredCount: { increment: 1 } };
    case 'OPENED':
      return { openedCount: { increment: 1 } };
    case 'CLICKED':
      return { clickedCount: { increment: 1 } };
    case 'REPLIED':
      return { repliedCount: { increment: 1 } };
    case 'BOUNCED':
      return { bouncedCount: { increment: 1 } };
    case 'UNSUBSCRIBED':
      return { unsubscribedCount: { increment: 1 } };
    default:
      return null;
  }
}
