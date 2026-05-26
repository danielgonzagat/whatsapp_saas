import nodemailer from 'nodemailer';
import { resolveEmailConfig } from './email-config.helper';

type WorkspaceLike = {
  id?: string;
  [key: string]: unknown;
};

type TemplateComponent = Record<string, unknown>;

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Email provider. */
export const emailProvider = {
  name: 'email',

  async sendText(workspace: WorkspaceLike, to: string, message: string) {
    void workspace;
    // 'to' here assumes email address. If it's a phone number, we fail.
    if (!to.includes('@')) {
      console.warn('[EmailProvider] Target is not an email:', to);
      return { error: 'invalid_email_target' };
    }

    const cfg = resolveEmailConfig();
    if (!cfg) {
      console.warn('[EmailProvider] Not configured');
      return { error: 'email_not_configured' };
    }

    try {
      const transporter = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        auth: cfg.user && cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined,
      });

      // Simple heuristic: first line is subject
      const lines = message.split('\n');
      const subject = lines[0].length < 100 ? lines[0] : 'Nova mensagem';
      const body = lines.length > 1 ? lines.slice(1).join('\n') : message;

      const info = await transporter.sendMail({
        from: cfg.from,
        to,
        subject,
        text: body,
        // html: body.replace(/\n/g, "<br/>") // simple conversion
      });

      return { id: info.messageId, status: 'SENT' };
    } catch (err: unknown) {
      console.error('[EmailProvider] Failed:', err);
      return { error: toErrorMessage(err) };
    }
  },

  // Mídia no email vira anexo
  async sendMedia(
    workspace: WorkspaceLike,
    to: string,
    type: string,
    url: string,
    caption?: string,
  ) {
    void workspace;
    void type;
    if (!to.includes('@')) {
      return { error: 'invalid_email_target' };
    }

    const cfg = resolveEmailConfig();
    if (!cfg) {
      return { error: 'email_not_configured' };
    }

    try {
      const transporter = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        auth: cfg.user && cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined,
      });

      await transporter.sendMail({
        from: cfg.from,
        to,
        subject: 'Arquivo enviado',
        text: caption || 'Segue anexo.',
        attachments: [{ path: url }],
      });
      return { status: 'SENT' };
    } catch (err: unknown) {
      return { error: toErrorMessage(err) };
    }
  },

  async sendTemplate(
    workspace: WorkspaceLike,
    to: string,
    name: string,
    _lang: string,
    _components: TemplateComponent[],
  ) {
    void _lang;
    void _components;
    // Fallback to text
    return this.sendText(workspace, to, `Template: ${name}`);
  },
};
