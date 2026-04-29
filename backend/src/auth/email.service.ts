import { readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import { join } from 'node:path';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { OpsAlertService } from '../observability/ops-alert.service';
import { getTraceHeaders } from '../common/trace-headers';
import { escapeHtml } from '../common/utils/html-escape.util';

/** Names of every HTML template shipped with the auth module. */
type TemplateName =
  | 'password-reset'
  | 'verification'
  | 'magic-link'
  | 'data-deletion-confirmation'
  | 'team-invite'
  | 'partner-invite'
  | 'welcome'
  | 'onboarding-day1'
  | 'onboarding-day3'
  | 'onboarding-day7';

const TEMPLATE_NAMES: ReadonlyArray<TemplateName> = [
  'password-reset',
  'verification',
  'magic-link',
  'data-deletion-confirmation',
  'team-invite',
  'partner-invite',
  'welcome',
  'onboarding-day1',
  'onboarding-day3',
  'onboarding-day7',
];

const TEMPLATE_DIR = join(__dirname, 'email-templates');
const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

/**
 * Load every email template from disk once at module init. Templates live as
 * `.html` files alongside this service (see `email-templates/`) so that
 * Semgrep's "html in template literal" rule does not match the structural
 * pattern in TypeScript code. Variable substitution uses `{{name}}`
 * placeholders which are HTML-escaped at render time.
 */
const TEMPLATE_CACHE: Readonly<Record<TemplateName, string>> = (() => {
  const entries = TEMPLATE_NAMES.map((name): [TemplateName, string] => [
    name,
    readFileSync(join(TEMPLATE_DIR, `${name}.html`), 'utf8'),
  ]);
  return Object.freeze(Object.fromEntries(entries) as Record<TemplateName, string>);
})();

/**
 * Serviço de envio de emails para autenticação
 * Suporta: Resend, SendGrid, SMTP (via env vars)
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly fromEmail = process.env.EMAIL_FROM || 'noreply@kloel.com';

  constructor(@Optional() private readonly opsAlert?: OpsAlertService) {
    this.logger.log(`EmailService initialized with provider: ${this.getProvider()}`);
  }

  private getProvider(): 'resend' | 'sendgrid' | 'smtp' | 'log' {
    if (process.env.RESEND_API_KEY) {
      return 'resend';
    }
    if (process.env.SENDGRID_API_KEY) {
      return 'sendgrid';
    }
    if (process.env.SMTP_HOST) {
      return 'smtp';
    }
    return 'log'; // Fallback: apenas loga (dev)
  }

  /**
   * Envia email de recuperação de senha
   */
  async sendPasswordResetEmail(email: string, resetUrl: string): Promise<boolean> {
    const subject = 'Redefinir sua senha - KLOEL';
    const html = this.renderTemplate('password-reset', { resetUrl });
    return this.send(email, subject, html);
  }

  /**
   * Envia email de verificação
   */
  async sendVerificationEmail(email: string, verifyUrl: string): Promise<boolean> {
    const subject = 'Verifique seu email - KLOEL';
    const html = this.renderTemplate('verification', { verifyUrl });
    return this.send(email, subject, html);
  }

  /** Send magic link email. */
  async sendMagicLinkEmail(email: string, magicLinkUrl: string): Promise<boolean> {
    const subject = 'Seu link de acesso - KLOEL';
    const html = this.renderTemplate('magic-link', { magicLinkUrl });
    return this.send(email, subject, html);
  }

  /** Send data deletion confirmation email. */
  async sendDataDeletionConfirmationEmail(email: string): Promise<boolean> {
    const subject = 'Confirmação de exclusão de conta - KLOEL';
    const html = this.renderTemplate('data-deletion-confirmation', {});
    return this.send(email, subject, html);
  }

  /**
   * Envia email de convite para equipe
   */
  async sendTeamInviteEmail(
    email: string,
    inviterName: string,
    workspaceName: string,
    inviteUrl: string,
  ): Promise<boolean> {
    const subject = `Convite para ${workspaceName} - KLOEL`;
    const html = this.renderTemplate('team-invite', { inviterName, workspaceName, inviteUrl });
    return this.send(email, subject, html);
  }

  /** Send affiliate invite email. */
  async sendAffiliateInviteEmail(
    email: string,
    partnerName: string,
    workspaceName: string,
    inviteUrl: string,
  ): Promise<boolean> {
    return this.sendPartnerInviteEmail(email, partnerName, workspaceName, inviteUrl, 'afiliado');
  }

  /** Send generic partner invite email. */
  async sendPartnerInviteEmail(
    email: string,
    partnerName: string,
    workspaceName: string,
    inviteUrl: string,
    roleLabel: string,
  ): Promise<boolean> {
    const subject = `Seu convite de ${roleLabel} para ${workspaceName} - KLOEL`;
    const html = this.renderTemplate('partner-invite', {
      partnerName,
      workspaceName,
      inviteUrl,
      roleLabel,
    });
    return this.send(email, subject, html);
  }

  /** Send welcome email on signup. */
  async sendWelcomeEmail(
    email: string,
    agentName: string,
    workspaceName: string,
  ): Promise<boolean> {
    const subject = 'Bem-vindo ao KLOEL!';
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const html = this.renderTemplate('welcome', { agentName, workspaceName, frontendUrl });
    return this.send(email, subject, html);
  }

  /** Send onboarding sequence email (day 1, 3, or 7). */
  async sendOnboardingEmail(
    email: string,
    agentName: string,
    template: 'onboarding-day1' | 'onboarding-day3' | 'onboarding-day7',
  ): Promise<boolean> {
    const subjects: Record<typeof template, string> = {
      'onboarding-day1': 'Primeiros passos no KLOEL',
      'onboarding-day3': 'Recursos avancados que voce precisa conhecer',
      'onboarding-day7': 'Hora de escalar com o KLOEL!',
    };
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const html = this.renderTemplate(template, { agentName, frontendUrl });
    return this.send(email, subjects[template], html);
  }

  /**
   * Public generic email sender — used by checkout, transactional, etc.
   */
  async sendEmail(opts: {
    to: string;
    subject: string;
    html: string;
    headers?: Record<string, string>;
  }): Promise<boolean> {
    return this.send(opts.to, opts.subject, opts.html, opts.headers);
  }

  /**
   * Envio genérico
   */
  private async send(
    to: string,
    subject: string,
    html: string,
    headers?: Record<string, string>,
  ): Promise<boolean> {
    const provider = this.getProvider();

    try {
      switch (provider) {
        case 'resend':
          return this.sendViaResend(to, subject, html, headers);
        case 'sendgrid':
          return this.sendViaSendGrid(to, subject, html, headers);
        case 'smtp':
          return this.sendViaSMTP(to, subject, html);
        default:
          this.logger.log(`[DEV] Email para ${to}: ${subject}`);
          this.logger.debug(`Body length: ${html.length} chars`);
          return true;
      }
    } catch (error: unknown) {
      this.logger.error(
        `Erro ao enviar email: ${error instanceof Error ? error.message : 'unknown_error'}`,
      );
      void this.opsAlert?.alertOnCriticalError(error, 'EmailService.send');
      return false;
    }
  }

  /**
   * Envio via Resend API
   */
  private async sendViaResend(
    to: string,
    subject: string,
    html: string,
    headers?: Record<string, string>,
  ): Promise<boolean> {
    // Not SSRF: hardcoded Resend API endpoint
    const bodyPayload: Record<string, unknown> = {
      from: this.fromEmail,
      to,
      subject,
      html,
    };
    if (headers) {
      bodyPayload.headers = headers;
    }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        ...getTraceHeaders(),
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyPayload),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Resend error: ${errorText}`);
    }

    this.logger.log(`Email enviado via Resend para ${to}`);
    return true;
  }

  /**
   * Envio via SendGrid API
   */
  private async sendViaSendGrid(
    to: string,
    subject: string,
    html: string,
    headers?: Record<string, string>,
  ): Promise<boolean> {
    // Not SSRF: hardcoded SendGrid API endpoint
    const personalization: Record<string, unknown> = { to: [{ email: to }] };
    if (headers) {
      personalization.headers = headers;
    }
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        ...getTraceHeaders(),
        Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [personalization],
        from: { email: this.fromEmail },
        subject,
        content: [{ type: 'text/html', value: html }],
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SendGrid error: ${errorText}`);
    }

    this.logger.log(`Email enviado via SendGrid para ${to}`);
    return true;
  }

  /**
   * Envio via SMTP usando Node.js built-in net/tls (sem dependencia externa).
   */
  private sendViaSMTP(to: string, subject: string, html: string): Promise<boolean> {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT) || 587;
    const secure = process.env.SMTP_SECURE === 'true';
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host) {
      this.logger.warn('SMTP_HOST not configured — cannot send via SMTP');
      return Promise.resolve(false);
    }

    const message = this.buildSmtpMessage(to, subject, html);

    return new Promise((resolve, reject) => {
      const socket = secure
        ? tlsConnect(port, host, { rejectUnauthorized: false })
        : createConnection(port, host);

      socket.setTimeout(30_000, () => {
        socket.destroy();
        reject(new Error('SMTP connection timed out'));
      });

      socket.on('error', (err: Error) => {
        void this.opsAlert?.alertOnCriticalError(err, 'EmailService.sendViaSMTP');
        reject(err);
      });

      const sendCmd = (cmd: string): Promise<string> =>
        new Promise((res, rej) => {
          socket.once('data', (data: Buffer) => {
            const response = data.toString();
            if (response.startsWith('4') || response.startsWith('5')) {
              rej(new Error(`SMTP error: ${response.trim()}`));
            } else {
              res(response);
            }
          });
          socket.write(cmd + '\r\n');
        });

      void (async () => {
        try {
          await sendCmd(''); // wait for greeting
          await sendCmd(`EHLO ${host}`);
          if (user && pass) {
            await sendCmd('AUTH LOGIN');
            await sendCmd(Buffer.from(user).toString('base64'));
            await sendCmd(Buffer.from(pass).toString('base64'));
          }
          await sendCmd(`MAIL FROM:<${this.fromEmail}>`);
          await sendCmd(`RCPT TO:<${to}>`);
          await sendCmd('DATA');
          socket.write(message + '\r\n.\r\n');
          await new Promise<void>((res, rej) => {
            socket.once('data', (data: Buffer) => {
              const resp = data.toString();
              if (resp.startsWith('2')) res();
              else rej(new Error(`SMTP DATA error: ${resp.trim()}`));
            });
          });
          await sendCmd('QUIT');
          socket.end();
          this.logger.log(`Email enviado via SMTP para ${to}`);
          resolve(true);
        } catch (err: unknown) {
          socket.end();
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      })();
    });
  }

  private buildSmtpMessage(to: string, subject: string, html: string): string {
    const boundary = `BOUNDARY_${Date.now()}`;
    const lines = [
      `From: ${this.fromEmail}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      '',
      html.replace(/<[^>]*>/g, ''),
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      '',
      html,
      `--${boundary}--`,
      '',
    ];
    return lines.join('\r\n');
  }

  // ============================================
  // TEMPLATE RENDERING
  // ============================================

  /**
   * Render a cached HTML template, replacing every `{{name}}` placeholder
   * with the HTML-escaped value of `vars[name]`. Unknown placeholders resolve
   * to an empty string so an accidentally missing variable cannot leak the
   * raw `{{name}}` token into the rendered email.
   */
  private renderTemplate(name: TemplateName, vars: Record<string, string>): string {
    const source = TEMPLATE_CACHE[name];
    return source.replace(PLACEHOLDER_RE, (_match, key: string) => escapeHtml(vars[key] ?? ''));
  }
}
