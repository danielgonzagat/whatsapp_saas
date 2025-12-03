import nodemailer from "nodemailer";

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

export const emailProvider = {
  name: "email",

  async sendText(workspace: any, to: string, message: string) {
    // 'to' here assumes email address. If it's a phone number, we fail.
    if (!to.includes("@")) {
        console.warn("[EmailProvider] Target is not an email:", to);
        return { error: "invalid_email_target" };
    }

    const cfg = resolveEmailConfig();
    if (!cfg) {
        console.warn("[EmailProvider] Not configured");
        return { error: "email_not_configured" };
    }

    try {
        const transporter = nodemailer.createTransport({
            host: cfg.host,
            port: cfg.port,
            secure: cfg.secure,
            auth: cfg.user && cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined,
        });

        // Simple heuristic: first line is subject
        const lines = message.split("\n");
        const subject = lines[0].length < 100 ? lines[0] : "Nova mensagem";
        const body = lines.length > 1 ? lines.slice(1).join("\n") : message;

        const info = await transporter.sendMail({
            from: cfg.from,
            to,
            subject,
            text: body,
            // html: body.replace(/\n/g, "<br/>") // simple conversion
        });

        return { id: info.messageId, status: "SENT" };
    } catch (err: any) {
        console.error("[EmailProvider] Failed:", err);
        return { error: err.message };
    }
  },

  // Mídia no email vira anexo
  async sendMedia(workspace: any, to: string, type: string, url: string, caption?: string) {
     if (!to.includes("@")) return { error: "invalid_email_target" };
     
     const cfg = resolveEmailConfig();
     if (!cfg) return { error: "email_not_configured" };

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
            subject: "Arquivo enviado",
            text: caption || "Segue anexo.",
            attachments: [
                { path: url }
            ]
        });
        return { status: "SENT" };
     } catch (err: any) {
         return { error: err.message };
     }
  },
  
  async sendTemplate(workspace: any, to: string, name: string, lang: string, components: any[]) {
      // Fallback to text
      return this.sendText(workspace, to, `Template: ${name}`);
  }
};
