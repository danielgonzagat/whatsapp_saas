import { autoProvider } from "./auto-provider";
import { emailProvider } from "./email-provider";
import { prisma } from "../db";

export class ProviderRegistry {
  static async getProviderForUser(user: string, workspaceId?: string) {
    // 1. Check Channel Heuristics
    if (user.includes("@")) {
        // It's an email target
        // Prefer explicit workspace context to avoid crossing tenants.
        const contact = workspaceId
          ? await prisma.contact.findFirst({
              where: { email: user, workspaceId },
              include: { workspace: true }
            })
          : await prisma.contact.findFirst({
              where: { email: user },
              include: { workspace: true }
            });
        
        const workspaceConfig = contact
          ? { id: contact.workspace.id }
          : workspaceId
            ? { id: workspaceId }
            : { id: "default" };
        
        return {
            ...emailProvider,
            workspace: workspaceConfig
        };
    }

    // 2. Default: WhatsApp (Phone)
    const normalized = (user || "").replace(/\D/g, "");

    const contact = workspaceId
      ? await prisma.contact.findUnique({
          where: {
            workspaceId_phone: {
              workspaceId,
              phone: normalized,
            },
          },
          include: { workspace: true },
        })
      : await prisma.contact.findFirst({
          where: { phone: normalized },
          include: { workspace: true }
        });

    if (!contact) {
      return {
        ...autoProvider,
        workspace: {
          id: workspaceId || "default",
          whatsappProvider: "whatsapp-api",
        }
      };
    }

    const workspaceConfig = {
      id: contact.workspace.id,
      whatsappProvider: "whatsapp-api",
      jitterMin: contact.workspace.jitterMin,
      jitterMax: contact.workspace.jitterMax,
    };

    return {
      ...autoProvider,
      workspace: workspaceConfig
    };
  }
}
