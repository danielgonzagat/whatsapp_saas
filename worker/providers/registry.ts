import { prisma } from '../db';
import { autoProvider } from './auto-provider';
import { emailProvider } from './email-provider';
import {
  type WhatsAppProvider,
  getWhatsAppProviderFromEnv,
  resolveWhatsAppProvider,
} from './whatsapp-provider-resolver';

const D_RE = /\D/g;

function getDefaultWhatsAppProvider(): WhatsAppProvider {
  return getWhatsAppProviderFromEnv();
}

function resolveWorkspaceProvider(workspace: { providerSettings?: unknown } | null | undefined) {
  const providerSettings =
    workspace?.providerSettings && typeof workspace.providerSettings === 'object'
      ? (workspace.providerSettings as Record<string, unknown>)
      : {};
  return resolveWhatsAppProvider(providerSettings.whatsappProvider);
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
          where: { email: user },
          include: { workspace: true },
        });

    const workspaceConfig = contact
      ? {
          id: contact.workspace.id,
          whatsappProvider: resolveWorkspaceProvider(contact.workspace),
          jitterMin: contact.workspace.jitterMin,
          jitterMax: contact.workspace.jitterMax,
        }
      : workspaceId
        ? { id: workspaceId, whatsappProvider: getDefaultWhatsAppProvider() }
        : { id: 'default', whatsappProvider: getDefaultWhatsAppProvider() };

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
        where: { phone: normalized },
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
    whatsappProvider: resolveWorkspaceProvider(contact.workspace),
    jitterMin: contact.workspace.jitterMin,
    jitterMax: contact.workspace.jitterMax,
  };

  return {
    ...autoProvider,
    workspace: workspaceConfig,
  };
}

export const ProviderRegistry = {
  getProviderForUser,
} as const;
