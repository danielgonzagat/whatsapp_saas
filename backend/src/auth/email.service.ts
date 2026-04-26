import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { getTraceHeaders } from '../common/trace-headers';
import { escapeHtml } from '../common/utils/html-escape.util';

/** Names of every HTML template shipped with the auth module. */
type TemplateName =
  | 'password-reset'
  | 'verification'
  | 'magic-link'
  | 'data-deletion-confirmation'
  | 'team-invite'
  | 'partner-invite';

const TEMPLATE_NAMES: ReadonlyArray<TemplateName> = [
  'password-reset',
  'verification',
  'magic-link',
  'data-deletion-confirmation',
  'team-invite',
  'partner-invite',
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

  constructor() {
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
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      this.logger.error(`Erro ao enviar email: ${errorInstanceofError.message}`);
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
   * Envio via SMTP (nodemailer)
   */
  private sendViaSMTP(to: string, subject: string, _html: string): Promise<boolean> {
    // Para usar nodemailer, precisa instalar: npm install nodemailer @types/nodemailer
    // Por enquanto, usamos fetch para um relay SMTP se disponível
    this.logger.warn('SMTP não implementado no backend. Use Resend ou SendGrid.');
    this.logger.log(`[SMTP] Email para ${to}: ${subject}`);
    return Promise.resolve(true);
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
