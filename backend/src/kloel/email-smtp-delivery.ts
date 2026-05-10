import { createConnection } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import type { OpsAlertService } from '../observability/ops-alert.service';

export type EmailProvider = 'resend' | 'sendgrid' | 'smtp' | 'log';

export interface EmailSmtpDeliveryOverride {
  host: string;
  port?: number;
  secure?: boolean;
  user?: string;
  pass?: string;
}

export interface EmailDeliveryOverride {
  provider?: Exclude<EmailProvider, 'log'>;
  fromEmail?: string;
  fromName?: string;
  resendApiKey?: string;
  sendgridApiKey?: string;
  smtp?: EmailSmtpDeliveryOverride;
}

export interface ResolvedEmailDelivery {
  fromEmail: string;
  fromName: string;
  provider: EmailProvider;
  resendApiKey?: string;
  sendgridApiKey?: string;
  smtp?: Required<Pick<EmailSmtpDeliveryOverride, 'host' | 'port' | 'secure'>> &
    Pick<EmailSmtpDeliveryOverride, 'user' | 'pass'>;
}

function dotStuffSmtpBody(value: string): string {
  return value
    .split('\n')
    .map((line) => {
      const normalized = line.endsWith('\r') ? line.slice(0, -1) : line;
      return normalized.startsWith('.') ? `.${normalized}` : normalized;
    })
    .join('\r\n');
}

function buildSmtpMessage(
  to: string,
  subject: string,
  html: string,
  delivery: ResolvedEmailDelivery,
): string {
  const boundary = `KLOEL_${Date.now()}`;
  const plain = html.replace(/<[^>]*>/g, '');
  return [
    `From: ${delivery.fromName} <${delivery.fromEmail}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    dotStuffSmtpBody(plain),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    dotStuffSmtpBody(html),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

export function sendViaSmtp(params: {
  to: string;
  subject: string;
  html: string;
  delivery: ResolvedEmailDelivery;
  alert?: OpsAlertService;
}): Promise<boolean> {
  const { to, subject, html, delivery, alert } = params;
  if (!delivery.smtp?.host) {
    return Promise.resolve(false);
  }

  const { host, port, secure, user, pass } = delivery.smtp;
  const message = buildSmtpMessage(to, subject, html, delivery);

  return new Promise((resolve, reject) => {
    const socket = secure
      ? tlsConnect(port, host, { rejectUnauthorized: true })
      : createConnection(port, host);

    socket.setTimeout(30_000, () => {
      socket.destroy();
      reject(new Error('SMTP connection timed out'));
    });

    socket.on('error', (err: Error) => {
      void alert?.alertOnCriticalError(err, 'EmailCampaignService.sendViaSmtp');
      reject(err);
    });

    const readResponse = (): Promise<string> =>
      new Promise((res, rej) => {
        socket.once('data', (data: Buffer) => {
          const response = data.toString();
          if (/^[45]/.test(response)) {
            rej(new Error(`SMTP error: ${response.trim()}`));
          } else {
            res(response);
          }
        });
      });

    const sendCmd = async (cmd: string): Promise<string> => {
      socket.write(`${cmd}\r\n`);
      return readResponse();
    };

    void (async () => {
      try {
        await readResponse();
        await sendCmd(`EHLO ${host}`);
        if (user && pass) {
          await sendCmd('AUTH LOGIN');
          await sendCmd(Buffer.from(user).toString('base64'));
          await sendCmd(Buffer.from(pass).toString('base64'));
        }
        await sendCmd(`MAIL FROM:<${delivery.fromEmail}>`);
        await sendCmd(`RCPT TO:<${to}>`);
        await sendCmd('DATA');
        socket.write(`${message}\r\n.\r\n`);
        await readResponse();
        await sendCmd('QUIT');
        socket.end();
        resolve(true);
      } catch (err: unknown) {
        socket.end();
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    })();
  });
}
