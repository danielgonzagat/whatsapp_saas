import { autoProvider } from "./auto-provider";
import { emailProvider } from "./email-provider";
import { prisma } from "../db";

export class ProviderRegistry {
  static async getProviderForUser(user: string) {
    // 1. Check Channel Heuristics
    if (user.includes("@")) {
        // It's an email target
        // Try to find workspace context via Contact (by email)
        const contact = await prisma.contact.findFirst({
            where: { email: user },
            include: { workspace: true }
        });
        
        const workspaceConfig = contact ? { id: contact.workspace.id } : { id: "default" };
        
        return {
            ...emailProvider,
            workspace: workspaceConfig
        };
    }

    // 2. Default: WhatsApp (Phone)
    const normalized = (user || "").replace(/\D/g, "");

    const contact = await prisma.contact.findFirst({
      where: { phone: normalized },
      include: { workspace: true }
    });

    if (!contact) {
      // Fallback: usa provider auto sem workspace, mas injeta id default
      return {
        ...autoProvider,
        workspace: { id: "default", whatsappProvider: "auto" }
      };
    }

    // 3. Configure provider with workspace settings
    const settings: any = contact.workspace?.providerSettings || {};
    const workspaceConfig = {
      id: contact.workspace.id,
      whatsappProvider: settings.whatsappProvider || "auto",
      meta: settings.meta ? { ...settings.meta, token: tryDecrypt(settings.meta.token) } : {},
      wpp: settings.wpp || {},
      evolution: settings.evolution
        ? { ...settings.evolution, apiKey: tryDecrypt(settings.evolution.apiKey) }
        : {},
      ultrawa: settings.ultrawa
        ? { ...settings.ultrawa, apiKey: tryDecrypt(settings.ultrawa.apiKey) }
        : {},
      jitterMin: contact.workspace.jitterMin,
      jitterMax: contact.workspace.jitterMax,
    };

    return {
      ...autoProvider,
      workspace: workspaceConfig
    };
  }
}

function tryDecrypt(value?: string | null) {
  if (!value) return value;
  if (!value.startsWith("enc:")) return value;
  const secret = process.env.PROVIDER_SECRET_KEY;
  if (!secret) return value;
  try {
    const [_, ivB64, tagB64, dataB64] = value.split(":");
    const crypto = require("crypto");
    const key = crypto.createHash("sha256").update(secret).digest();
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivB64, "base64")
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
    return decrypted;
  } catch {
    return value;
  }
}
