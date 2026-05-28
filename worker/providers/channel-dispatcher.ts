import nodemailer from 'nodemailer';
import { WorkerLogger } from '../logger';
import { resolveEmailConfig } from './email-config.helper';

const log = new WorkerLogger('channel-dispatcher');

/** Send email. */
export async function sendEmail(to: string, subject: string, text: string) {
  const cfg = resolveEmailConfig();
  if (!cfg) {
    throw new Error('email_not_configured');
  }

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user && cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined,
  });

  await transporter.sendMail({
    from: cfg.from,
    to,
    subject,
    text,
  });
}

/** Channel enabled. */
export function channelEnabled(
  settings: Record<string, unknown> | null | undefined,
  channel: 'email',
): boolean {
  const cfg = settings?.[channel];
  if (
    cfg &&
    typeof cfg === 'object' &&
    cfg !== null &&
    'enabled' in cfg &&
    typeof (cfg as Record<string, unknown>).enabled === 'boolean'
  ) {
    return (cfg as Record<string, unknown>).enabled as boolean;
  }
  return false;
}

/** Log fallback. */
export function logFallback(
  channel: string,
  status: 'sent' | 'skipped' | 'error',
  reason?: string,
) {
  log.info('fallback_attempt', { channel, status, reason });
}
