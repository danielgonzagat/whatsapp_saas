import { prisma } from '../db';
import { flowQueue } from '../queue';

/**
 * Dispara um fluxo automaticamente após scraping, se configurado no workspace.
 * Usa um flowId salvo em providerSettings.scraper?.flowId.
 */
export async function triggerFlowForScrapedLeads(
  workspaceId: string,
  contactIds: string[],
  inputFlowId?: string,
) {
  let resolvedFlowId = inputFlowId;
  if (!resolvedFlowId) {
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    const settings = ws?.providerSettings as Record<string, unknown> | null;
    const scraper = settings?.scraper as Record<string, unknown> | undefined;
    resolvedFlowId = typeof scraper?.flowId === 'string' ? scraper.flowId : undefined;
  }
  if (!resolvedFlowId || !contactIds.length) return;

  // Garante que o flow pertence ao workspace
  const flow = await prisma.flow.findFirst({ where: { id: resolvedFlowId, workspaceId } });
  if (!flow) return;

  // biome-ignore lint/performance/noAwaitInLoops: sequential processing required
  for (const contactId of contactIds) {
    const contact = await prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact?.phone || contact.workspaceId !== workspaceId) continue;

    await flowQueue.add('run-flow', {
      flowId: resolvedFlowId,
      user: contact.phone,
      flow: null, // engine vai carregar do DB
      startNode: null, // engine usa start do fluxo salvo
      workspaceId,
      workspace: null,
    });
  }
}
