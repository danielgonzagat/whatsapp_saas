import { WorkerLogger } from '../logger';

const log = new WorkerLogger('fallback-email');

export function buildFallbackEmailHtml(
  contactName: string | null,
  message: string,
  workspaceName: string | null,
): string {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Olá${contactName ? ` ${contactName}` : ''}!</h2>
      <p style="white-space: pre-wrap;">${message}</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="color: #666; font-size: 12px;">
        Enviado automaticamente por ${workspaceName || 'KLOEL'}
      </p>
    </div>
  `;
}

async function trySendFallbackEmailViaResend(args: {
  to: string;
  fromEmail: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    return false;
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: args.fromEmail,
        to: args.to,
        subject: args.subject,
        html: args.html,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (response.ok) {
      log.info('fallback_email_resend_sent', { to: args.to });
      return true;
    }
  } catch (e) {
    log.warn('fallback_email_resend_error', {
      error: e instanceof Error ? e.message : String(e),
    });
  }
  return false;
}

async function trySendFallbackEmailViaSendGrid(args: {
  to: string;
  fromEmail: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  if (!process.env.SENDGRID_API_KEY) {
    return false;
  }
  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: args.to }] }],
        from: { email: args.fromEmail },
        subject: args.subject,
        content: [{ type: 'text/html', value: args.html }],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (response.ok || response.status === 202) {
      log.info('fallback_email_sendgrid_sent', { to: args.to });
      return true;
    }
  } catch (e) {
    log.warn('fallback_email_sendgrid_error', {
      error: e instanceof Error ? e.message : String(e),
    });
  }
  return false;
}

export async function sendFallbackEmail(
  to: string,
  contactName: string | null,
  message: string,
  workspaceName: string | null,
): Promise<boolean> {
  const fromEmail = process.env.EMAIL_FROM || 'noreply@kloel.com';
  const subject = `Mensagem de ${workspaceName || 'sua empresa'}`;
  const html = buildFallbackEmailHtml(contactName, message, workspaceName);

  if (await trySendFallbackEmailViaResend({ to, fromEmail, subject, html })) {
    return true;
  }
  if (await trySendFallbackEmailViaSendGrid({ to, fromEmail, subject, html })) {
    return true;
  }

  if (!process.env.RESEND_API_KEY && !process.env.SENDGRID_API_KEY) {
    log.warn('fallback_email_no_provider', { to });
  }
  return false;
}
