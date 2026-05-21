import type { ConfigService } from '@nestjs/config';
import { resolveFrontendUrl } from './config-resolver';

export function encodeHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) {
    return value;
  }
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

export function buildRawMimeMessage(
  input: {
    fromEmail: string;
    toEmail: string;
    subject: string;
    html: string;
    proactive: boolean;
  },
  config: ConfigService,
): string {
  const unsubscribeUrl = `${resolveFrontendUrl(config)}/email/unsubscribe?email=${encodeURIComponent(
    input.toEmail,
  )}`;
  const headers = [
    `From: ${input.fromEmail}`,
    `To: ${input.toEmail}`,
    `Subject: ${encodeHeader(input.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
  ];
  if (input.proactive) {
    headers.push(`List-Unsubscribe: <${unsubscribeUrl}>`);
  }

  return Buffer.from(`${headers.join('\r\n')}\r\n\r\n${input.html}`, 'utf8')
    .toString('base64url')
    .replace(/=+$/, '');
}
