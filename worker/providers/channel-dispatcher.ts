import nodemailer from "nodemailer";
import { WorkerLogger } from "../logger";

const log = new WorkerLogger("channel-dispatcher");

type EmailConfig = {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
  secure: boolean;
};

function resolveEmailConfig(): EmailConfig | null {
  const host = process.env.MAIL_HOST;
  const port = Number(process.env.MAIL_PORT || 587);
  const user = process.env.MAIL_USER;
  const pass = process.env.MAIL_PASS;
  const from = process.env.MAIL_FROM || "autopilot@localhost";
  if (!host) return null;
  return {
    host,
    port,
    user,
    pass,
    from,
    secure: port === 465,
  };
}

export async function sendEmail(to: string, subject: string, text: string) {
  const cfg = resolveEmailConfig();
  if (!cfg) throw new Error("email_not_configured");

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

/**
 * Telegram básico (opcional). Requer TELEGRAM_BOT_TOKEN e chatId do contato.
 */
export async function sendTelegram(chatId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("telegram_not_configured");
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`telegram_send_failed: ${msg}`);
  }
}

export function channelEnabled(
  settings: any,
  channel: "email" | "telegram"
): boolean {
  const cfg = settings?.[channel];
  if (cfg && typeof cfg.enabled === "boolean") return cfg.enabled;
  return false;
}

export function logFallback(channel: string, status: "sent" | "skipped" | "error", reason?: string) {
  log.info("fallback_attempt", { channel, status, reason });
}
