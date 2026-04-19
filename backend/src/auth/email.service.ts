import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { escapeHtml } from '../common/utils/html-escape.util';

/**
 * Serviço de envio de emails para autenticação
 * Suporta: Resend, SendGrid, SMTP (via env vars)
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly fromEmail = process.env.EMAIL_FROM || 'noreply@kloel.com';
  private smtpTransport: Transporter | null = null;

  constructor() {
    this.logger.log(`EmailService initialized with provider: ${this.getProvider()}`);
  }

  private getProvider(): 'resend' | 'sendgrid' | 'smtp' | 'log' {
    if (process.env.RESEND_API_KEY) return 'resend';
    if (process.env.SENDGRID_API_KEY) return 'sendgrid';
    if (process.env.SMTP_HOST) return 'smtp';
    return 'log'; // Fallback: apenas loga (dev)
  }

  /**
   * Envia email de recuperação de senha
   */
  async sendPasswordResetEmail(email: string, resetUrl: string): Promise<boolean> {
    const subject = 'Redefinir sua senha - KLOEL';
    const html = this.getPasswordResetTemplate(resetUrl);
    return this.send(email, subject, html);
  }

  /**
   * Envia email de verificação
   */
  async sendVerificationEmail(email: string, verifyUrl: string): Promise<boolean> {
    const subject = 'Verifique seu email - KLOEL';
    const html = this.getVerificationTemplate(verifyUrl);
    return this.send(email, subject, html);
  }

  /**
   * Envia magic link de login
   */
  async sendMagicLinkEmail(email: string, magicLinkUrl: string): Promise<boolean> {
    const subject = 'Seu link de acesso - KLOEL';
    const html = this.getMagicLinkTemplate(magicLinkUrl);
    return this.send(email, subject, html);
  }

  /**
   * Envia confirmação para vincular um novo provedor social a uma conta existente.
   */
  async sendAccountLinkConfirmationEmail(
    email: string,
    magicLinkUrl: string,
    providerLabel: string,
    recipientName?: string,
  ): Promise<boolean> {
    const subject = `Confirme a vinculação com ${providerLabel} - KLOEL`;
    const html = this.getAccountLinkConfirmationTemplate(
      magicLinkUrl,
      providerLabel,
      recipientName,
    );
    return this.send(email, subject, html);
  }

  /**
   * Envia confirmação de solicitação de exclusão de dados
   */
  async sendDataDeletionConfirmationEmail(
    email: string,
    confirmationCode: string,
    statusUrl: string,
    recipientName?: string,
  ): Promise<boolean> {
    const subject = 'Solicitação de exclusão registrada - KLOEL';
    const html = this.getDataDeletionConfirmationTemplate(
      confirmationCode,
      statusUrl,
      recipientName,
    );
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
    const html = this.getTeamInviteTemplate(inviterName, workspaceName, inviteUrl);
    return this.send(email, subject, html);
  }

  /**
   * Public generic email sender — used by checkout, transactional, etc.
   */
  async sendEmail(opts: { to: string; subject: string; html: string }): Promise<boolean> {
    return this.send(opts.to, opts.subject, opts.html);
  }

  /**
   * Envio genérico
   */
  private async send(to: string, subject: string, html: string): Promise<boolean> {
    const provider = this.getProvider();

    try {
      switch (provider) {
        case 'resend':
          return this.sendViaResend(to, subject, html);
        case 'sendgrid':
          return this.sendViaSendGrid(to, subject, html);
        case 'smtp':
          return this.sendViaSMTP(to, subject, html);
        default:
          this.logger.log(`[DEV] Email para ${to}: ${subject}`);
          this.logger.debug(`HTML: ${html.substring(0, 200)}...`);
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
  private async sendViaResend(to: string, subject: string, html: string): Promise<boolean> {
    // Not SSRF: hardcoded Resend API endpoint
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.fromEmail,
        to,
        subject,
        html,
      }),
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
  private async sendViaSendGrid(to: string, subject: string, html: string): Promise<boolean> {
    // Not SSRF: hardcoded SendGrid API endpoint
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
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
  private async sendViaSMTP(to: string, subject: string, html: string): Promise<boolean> {
    const transport = this.getSmtpTransport();
    await transport.sendMail({
      from: this.fromEmail,
      to,
      subject,
      html,
    });

    this.logger.log(`Email enviado via SMTP para ${to}`);
    return true;
  }

  private getSmtpTransport(): Transporter {
    if (this.smtpTransport) {
      return this.smtpTransport;
    }

    const host = String(process.env.SMTP_HOST || '').trim();
    const port = Number.parseInt(String(process.env.SMTP_PORT || '587').trim(), 10) || 587;
    const user = String(process.env.SMTP_USER || '').trim();
    const pass = String(process.env.SMTP_PASS || '').trim();

    if (!host) {
      throw new Error('SMTP_HOST not configured');
    }

    const auth = user || pass ? { user, pass } : undefined;

    this.smtpTransport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      ...(auth ? { auth } : {}),
    });

    return this.smtpTransport;
  }

  // ============================================
  // TEMPLATES HTML
  // ============================================

  private getPasswordResetTemplate(resetUrl: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px; }
          .container { max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
          .logo { font-size: 24px; font-weight: bold; color: #7c3aed; margin-bottom: 20px; }
          h1 { font-size: 22px; color: #1a1a1a; margin-bottom: 16px; }
          p { color: #666; line-height: 1.6; margin-bottom: 24px; }
          .button { display: inline-block; background: linear-gradient(135deg, #7c3aed, #2563eb); color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; }
          .footer { margin-top: 32px; font-size: 12px; color: #999; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">KLOEL</div>
          <h1>Redefinir sua senha</h1>
          <p>Recebemos uma solicitação para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha:</p>
          <a href="${escapeHtml(resetUrl)}" class="button">Redefinir Senha</a>
          <p style="margin-top: 24px; font-size: 14px;">Este link expira em 1 hora. Se você não solicitou esta alteração, ignore este email.</p>
          <div class="footer">
            <p>KLOEL - Inteligência Comercial Autônoma</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getVerificationTemplate(verifyUrl: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px; }
          .container { max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
          .logo { font-size: 24px; font-weight: bold; color: #7c3aed; margin-bottom: 20px; }
          h1 { font-size: 22px; color: #1a1a1a; margin-bottom: 16px; }
          p { color: #666; line-height: 1.6; margin-bottom: 24px; }
          .button { display: inline-block; background: linear-gradient(135deg, #10b981, #059669); color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; }
          .footer { margin-top: 32px; font-size: 12px; color: #999; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">KLOEL</div>
          <h1>Verifique seu email</h1>
          <p>Bem-vindo ao KLOEL! Por favor, confirme seu endereço de email clicando no botão abaixo:</p>
          <a href="${escapeHtml(verifyUrl)}" class="button">Verificar Email</a>
          <p style="margin-top: 24px; font-size: 14px;">Este link expira em 24 horas.</p>
          <div class="footer">
            <p>KLOEL - Inteligência Comercial Autônoma</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getMagicLinkTemplate(magicLinkUrl: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px; }
          .container { max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
          .logo { font-size: 24px; font-weight: bold; color: #1a1a1a; margin-bottom: 20px; }
          h1 { font-size: 22px; color: #1a1a1a; margin-bottom: 16px; }
          p { color: #666; line-height: 1.6; margin-bottom: 24px; }
          .button { display: inline-block; background: #111113; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; }
          .footer { margin-top: 32px; font-size: 12px; color: #999; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">KLOEL</div>
          <h1>Entrar com link mágico</h1>
          <p>Use o link abaixo para entrar na sua conta sem precisar digitar senha.</p>
          <a href="${escapeHtml(magicLinkUrl)}" class="button">Entrar no KLOEL</a>
          <p style="margin-top: 24px; font-size: 14px;">Este link expira em 30 minutos e pode ser usado uma única vez.</p>
          <div class="footer">
            <p>KLOEL - Inteligência Comercial Autônoma</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getAccountLinkConfirmationTemplate(
    magicLinkUrl: string,
    providerLabel: string,
    recipientName?: string,
  ): string {
    const safeName = recipientName?.trim() ? escapeHtml(recipientName.trim()) : 'sua conta';
    const safeProvider = escapeHtml(providerLabel);

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px; }
          .container { max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
          .logo { font-size: 24px; font-weight: bold; color: #111113; margin-bottom: 20px; }
          h1 { font-size: 22px; color: #1a1a1a; margin-bottom: 16px; }
          p { color: #666; line-height: 1.6; margin-bottom: 24px; }
          .button { display: inline-block; background: #111113; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; }
          .footer { margin-top: 32px; font-size: 12px; color: #999; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">KLOEL</div>
          <h1>Confirme a vinculação com ${safeProvider}</h1>
          <p>Recebemos uma solicitação para conectar o login com ${safeProvider} à ${safeName}. Para concluir a vinculação com segurança, confirme este acesso pelo link abaixo.</p>
          <a href="${escapeHtml(magicLinkUrl)}" class="button">Confirmar e entrar no KLOEL</a>
          <p style="margin-top: 24px; font-size: 14px;">Este link expira em 30 minutos e pode ser usado uma única vez. Se você não iniciou esse login, ignore este email.</p>
          <div class="footer">
            <p>KLOEL - Inteligência Comercial Autônoma</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getDataDeletionConfirmationTemplate(
    confirmationCode: string,
    statusUrl: string,
    recipientName?: string,
  ): string {
    const safeName = recipientName?.trim() ? escapeHtml(recipientName.trim()) : 'sua conta';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px; }
          .container { max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
          .logo { font-size: 24px; font-weight: bold; color: #111113; margin-bottom: 20px; }
          h1 { font-size: 22px; color: #1a1a1a; margin-bottom: 16px; }
          p { color: #666; line-height: 1.6; margin-bottom: 24px; }
          .button { display: inline-block; background: #111113; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; }
          .code { display: inline-block; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: #f3f3f4; color: #111113; padding: 10px 14px; border-radius: 8px; letter-spacing: 0.08em; }
          .footer { margin-top: 32px; font-size: 12px; color: #999; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">KLOEL</div>
          <h1>Solicitação de exclusão registrada</h1>
          <p>Recebemos um pedido de exclusão de dados referente a ${safeName}. O processamento completo pode levar até 30 dias corridos, preservando apenas dados exigidos por obrigação legal.</p>
          <p><strong>Código de confirmação:</strong><br><span class="code">${escapeHtml(confirmationCode)}</span></p>
          <a href="${escapeHtml(statusUrl)}" class="button">Acompanhar status</a>
          <p style="margin-top: 24px; font-size: 14px;">Se você não solicitou esta ação, responda este email imediatamente para que nossa equipe revise o pedido.</p>
          <div class="footer">
            <p>KLOEL - Inteligência Comercial Autônoma</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getTeamInviteTemplate(
    inviterName: string,
    workspaceName: string,
    inviteUrl: string,
  ): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px; }
          .container { max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
          .logo { font-size: 24px; font-weight: bold; color: #7c3aed; margin-bottom: 20px; }
          h1 { font-size: 22px; color: #1a1a1a; margin-bottom: 16px; }
          p { color: #666; line-height: 1.6; margin-bottom: 24px; }
          .button { display: inline-block; background: linear-gradient(135deg, #2563eb, #7c3aed); color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; }
          .footer { margin-top: 32px; font-size: 12px; color: #999; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">KLOEL</div>
          <h1>Convite para equipe</h1>
          <p><strong>${escapeHtml(inviterName)}</strong> te convidou para fazer parte da equipe <strong>${escapeHtml(workspaceName)}</strong> no KLOEL.</p>
          <a href="${escapeHtml(inviteUrl)}" class="button">Aceitar Convite</a>
          <p style="margin-top: 24px; font-size: 14px;">Este convite expira em 7 dias.</p>
          <div class="footer">
            <p>KLOEL - Inteligência Comercial Autônoma</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}
