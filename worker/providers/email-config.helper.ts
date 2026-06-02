/**
 * @capability EmailConfigResolver
 * @domain notifications-copilot
 */
import nodemailer from 'nodemailer';

/**
 * SMTP/email config shape used by worker email transport. Optional credentials
 * (user/pass) mean unauthenticated SMTP is allowed when MAIL_USER/MAIL_PASS
 * are unset.
 */
export type EmailConfig = {
  host: string;
  port: number;
  user?: string | undefined;
  pass?: string | undefined;
  from: string;
  secure: boolean;
};

/**
 * Resolves SMTP config from MAIL_HOST/MAIL_PORT/MAIL_USER/MAIL_PASS/MAIL_FROM
 * env vars. Returns null when MAIL_HOST is unset — caller treats that as
 * "email disabled". Marks secure=true on the standard SMTPS port 465.
 *
 * Canonical helper shared by worker/providers channel-dispatcher and
 * email-provider so both see the same env precedence + defaults.
 */
export function resolveEmailConfig(): EmailConfig | null {
  const host = process.env.MAIL_HOST;
  const port = Number(process.env.MAIL_PORT || 587);
  const user = process.env.MAIL_USER;
  const pass = process.env.MAIL_PASS;
  const from = process.env.MAIL_FROM || 'autopilot@localhost';
  if (!host) {
    return null;
  }
  return {
    host,
    port,
    user,
    pass,
    from,
    secure: port === 465,
  };
}

/**
 * Build a nodemailer SMTP transport from a resolved {@link EmailConfig}.
 * Centralizes the transport construction shared by `email-provider`'s
 * `sendText` and `sendMedia` paths. Credentials are only attached when both
 * user and pass are present (unauthenticated SMTP otherwise), preserving the
 * prior per-method behavior.
 */
export function createMailTransport(cfg: EmailConfig): nodemailer.Transporter {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user && cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined,
  });
}
