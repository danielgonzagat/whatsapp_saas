import { prisma } from "../db";
import { flowQueue } from "../queue";

/**
 * Dispara um fluxo automaticamente após scraping, se configurado no workspace.
 * Usa um flowId salvo em providerSettings.scraper?.flowId.
 */
export async function triggerFlowForScrapedLeads(workspaceId: string, contactIds: string[], flowId?: string) {
  if (!flowId) {
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    flowId = (ws?.providerSettings as any)?.scraper?.flowId;
  }
  if (!flowId || !contactIds.length) return;

  // Garante que o flow pertence ao workspace
  const flow = await prisma.flow.findFirst({ where: { id: flowId, workspaceId } });
  if (!flow) return;

  for (const contactId of contactIds) {
    const contact = await prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact?.phone || contact.workspaceId !== workspaceId) continue;

    await flowQueue.add("run-flow", {
      flowId,
      user: contact.phone,
      flow: null, // engine vai carregar do DB
      startNode: null, // engine usa start do fluxo salvo
      workspaceId,
      workspace: null,
    });
  }
}
