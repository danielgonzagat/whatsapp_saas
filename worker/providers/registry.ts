import { prisma } from '../db';
import { autoProvider } from './auto-provider';
import { emailProvider } from './email-provider';
import { type WhatsAppProvider, getWhatsAppProviderFromEnv } from './whatsapp-provider-resolver';

const D_RE = /\D/g;

function getDefaultWhatsAppProvider(): WhatsAppProvider {
  return getWhatsAppProviderFromEnv();
}

async function getProviderForUser(user: string, workspaceId?: string) {
  // 1. Check Channel Heuristics
  if (user.includes('@')) {
    // It's an email target
    // Prefer explicit workspace context to avoid crossing tenants.
    const contact = workspaceId
      ? await prisma.contact.findFirst({
          where: { email: user, workspaceId },
          include: { workspace: true },
        })
      : await prisma.contact.findFirst({
          where: { email: user, workspaceId: undefined },
          include: { workspace: true },
        });

    const workspaceConfig = contact
      ? { id: contact.workspace.id }
      : workspaceId
        ? { id: workspaceId }
        : { id: 'default' };

    return {
      ...emailProvider,
      workspace: workspaceConfig,
    };
  }

  // 2. Default: WhatsApp (Phone)
  const normalized = (user || '').replace(D_RE, '');

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
        where: { phone: normalized, workspaceId: undefined },
        include: { workspace: true },
      });

  if (!contact) {
    return {
      ...autoProvider,
      workspace: {
        id: workspaceId || 'default',
        whatsappProvider: getDefaultWhatsAppProvider(),
      },
    };
  }

  const workspaceConfig = {
    id: contact.workspace.id,
    whatsappProvider: getDefaultWhatsAppProvider(),
    jitterMin: contact.workspace.jitterMin,
    jitterMax: contact.workspace.jitterMax,
  };

  return {
    ...autoProvider,
    workspace: workspaceConfig,
  };
}

/** Provider registry. */
export const ProviderRegistry = {
  getProviderForUser,
} as const;
