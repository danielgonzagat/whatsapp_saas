import { prisma } from '../db';
import { flowQueue } from '../queue';
import { forEachSequential } from '../utils/async-sequence';

/**
 * Dispara um fluxo automaticamente após scraping, se configurado no workspace.
 * Usa um flowId salvo em providerSettings.scraper?.flowId.
 */

async function resolveScraperFlowId(
  workspaceId: string,
  inputFlowId: string | undefined,
): Promise<string | undefined> {
  if (inputFlowId) {
    return inputFlowId;
  }
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  const settings = ws?.providerSettings as Record<string, unknown> | null;
  const scraper = settings?.scraper as Record<string, unknown> | undefined;
  return typeof scraper?.flowId === 'string' ? scraper.flowId : undefined;
}

function isContactEligible(
  contact: { phone: string | null; workspaceId: string } | null,
  workspaceId: string,
): contact is { phone: string; workspaceId: string } {
  return Boolean(contact?.phone) && contact?.workspaceId === workspaceId;
}

async function enqueueScrapedContactFlow(
  flowId: string,
  workspaceId: string,
  contactId: string,
): Promise<void> {
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!isContactEligible(contact, workspaceId)) {
    return;
  }

  await flowQueue.add('run-flow', {
    flowId,
    user: contact.phone,
    flow: null, // engine vai carregar do DB
    startNode: null, // engine usa start do fluxo salvo
    workspaceId,
    workspace: null,
  });
}

/** Trigger flow for scraped leads. */
export async function triggerFlowForScrapedLeads(
  workspaceId: string,
  contactIds: string[],
  inputFlowId?: string,
) {
  const resolvedFlowId = await resolveScraperFlowId(workspaceId, inputFlowId);
  if (!resolvedFlowId || !contactIds.length) {
    return;
  }

  // Garante que o flow pertence ao workspace
  const flow = await prisma.flow.findFirst({ where: { id: resolvedFlowId, workspaceId } });
  if (!flow) {
    return;
  }

  await forEachSequential(contactIds, async (contactId) => {
    await enqueueScrapedContactFlow(resolvedFlowId, workspaceId, contactId);
  });
}
