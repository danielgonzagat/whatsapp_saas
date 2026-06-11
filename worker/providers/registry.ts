/**
 * @capability ProviderRegistry
 * @domain integrations
 */
import { prisma } from '../db';
import { WorkerLogger } from '../logger';
import { autoProvider } from './auto-provider';
import { emailProvider } from './email-provider';
import { type WhatsAppProvider, getWhatsAppProviderFromEnv } from './whatsapp-provider-resolver';

const D_RE = /\D/g;
const log = new WorkerLogger('ProviderRegistry');

function getDefaultWhatsAppProvider(): WhatsAppProvider {
  return getWhatsAppProviderFromEnv();
}

async function getProviderForUser(user: string, workspaceId?: string) {
  // Fail-closed tenant isolation (F3-A): external dispatch without an explicit
  // tenant is never allowed — no synthetic 'default' workspace fallback.
  if (!workspaceId) {
    log.error('provider_resolution_rejected_missing_workspace', { user });
    throw new Error(
      'getProviderForUser: workspaceId is required — refusing to dispatch without tenant context (fail-closed)',
    );
  }

  // 1. Check Channel Heuristics
  if (user.includes('@')) {
    // It's an email target — contact lookup MUST be scoped to the tenant.
    const contact = await prisma.contact.findFirst({
      where: { email: user, workspaceId },
      include: { workspace: true },
    });

    return {
      ...emailProvider,
      workspace: { id: contact ? contact.workspace.id : workspaceId },
    };
  }

  // 2. Default: WhatsApp (Phone)
  const normalized = (user || '').replace(D_RE, '');

  const contact = await prisma.contact.findUnique({
    where: {
      workspaceId_phone: {
        workspaceId,
        phone: normalized,
      },
    },
    include: { workspace: true },
  });

  if (!contact) {
    return {
      ...autoProvider,
      workspace: {
        id: workspaceId,
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
