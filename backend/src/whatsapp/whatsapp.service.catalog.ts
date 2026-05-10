import { BadRequestException } from '@nestjs/common';
import { forEachSequential } from '../common/async-sequence';
import { buildQueueJobId } from '../queue/job-id.util';
import { autopilotQueue } from '../queue/queue';
import { collectCatalogContactEntriesExt } from './whatsapp-catalog-contact-collector';
import { rankByPurchaseProbability } from './whatsapp.service.ranking';
import { readText, normalizeJsonObjExt } from './whatsapp-service.helpers';
import type { PrismaService } from '../prisma/prisma.service';
import type { WhatsAppCatchupService } from './whatsapp-catchup.service';
import type { CiaRuntimeService } from './cia-runtime.service';

export interface CatalogDeps {
  prisma: PrismaService;
  catchupService: WhatsAppCatchupService;
  ciaRuntime: CiaRuntimeService;
  resolveTrustedContactName: (phone: string, ...candidates: unknown[]) => string;
}

async function collectCatalogContactEntries(
  deps: CatalogDeps,
  ws: string,
  o?: { days?: number; onlyCataloged?: boolean },
) {
  return collectCatalogContactEntriesExt(
    { prisma: deps.prisma, resolveName: deps.resolveTrustedContactName },
    ws,
    o,
  );
}

export async function listCatalogContacts(
  deps: CatalogDeps,
  ws: string,
  o?: { days?: number; page?: number; limit?: number; onlyCataloged?: boolean },
) {
  const days = Math.max(1, Math.min(365, Number(o?.days || 30) || 30));
  const page = Math.max(1, Number(o?.page || 1) || 1);
  const limit = Math.max(1, Math.min(200, Number(o?.limit || 50) || 50));
  const oc = o?.onlyCataloged !== false;
  const entries = await collectCatalogContactEntries(deps, ws, { days, onlyCataloged: oc });
  const total = entries.length;
  const offset = (page - 1) * limit;
  return {
    workspaceId: ws,
    generatedAt: new Date().toISOString(),
    days,
    page,
    limit,
    total,
    onlyCataloged: oc,
    items: entries.slice(offset, offset + limit),
  };
}

export async function listPurchaseProbabilityRanking(
  deps: CatalogDeps,
  ws: string,
  o?: {
    days?: number;
    limit?: number;
    minLeadScore?: number;
    minProbabilityScore?: number;
    onlyCataloged?: boolean;
    excludeBuyers?: boolean;
  },
) {
  const days = Math.max(1, Math.min(365, Number(o?.days || 30) || 30));
  const limit = Math.max(1, Math.min(200, Number(o?.limit || 50) || 50));
  const mls = Math.max(0, Math.min(100, Number(o?.minLeadScore || 0) || 0));
  const mps = Math.max(0, Math.min(1, Number(o?.minProbabilityScore || 0) || 0));
  const oc = o?.onlyCataloged !== false;
  const eb = o?.excludeBuyers === true;
  const entries = await collectCatalogContactEntries(deps, ws, { days, onlyCataloged: oc });
  const filtered = entries.filter(
    (e) =>
      (!eb || e.buyerStatus !== 'BOUGHT') &&
      e.leadScore >= mls &&
      e.purchaseProbabilityScore >= mps,
  );
  const ranked = rankByPurchaseProbability(filtered)
    .slice(0, limit)
    .map((e, i) => ({ rank: i + 1, ...e }));
  return {
    workspaceId: ws,
    generatedAt: new Date().toISOString(),
    days,
    limit,
    minLeadScore: mls,
    minProbabilityScore: mps,
    onlyCataloged: oc,
    excludeBuyers: eb,
    total: ranked.length,
    items: ranked,
  };
}

export async function triggerCatalogRefresh(
  ws: string,
  o?: { days?: number; reason?: string },
) {
  const days = Math.max(1, Math.min(365, Number(o?.days || 30) || 30));
  const reason = String(o?.reason || 'manual_catalog_refresh').trim();
  const jid = buildQueueJobId('catalog-contacts-30d', ws);
  await autopilotQueue.add(
    'catalog-contacts-30d',
    { workspaceId: ws, days, reason },
    { jobId: jid, removeOnComplete: true },
  );
  return {
    scheduled: true,
    workspaceId: ws,
    days,
    reason,
    jobName: 'catalog-contacts-30d',
    jobId: jid,
  };
}

export async function triggerCatalogRescore(
  deps: CatalogDeps,
  ws: string,
  o?: { contactId?: string; days?: number; limit?: number; reason?: string },
) {
  const reason = String(o?.reason || 'manual_catalog_rescore').trim();
  const limit = Math.max(1, Math.min(500, Number(o?.limit || 100) || 100));
  let targets: { contactId: string; phone: string; contactName: string; chatId: string }[] = [];
  if (o?.contactId) {
    const c = await deps.prisma.contact.findFirst({
      where: { id: o.contactId, workspaceId: ws },
      select: { id: true, phone: true, name: true, customFields: true },
    });
    if (!c) throw new BadRequestException('contactId inválido');
    const cf = normalizeJsonObjExt(c.customFields);
    targets = [
      {
        contactId: c.id,
        phone: c.phone,
        contactName: c.name || c.phone,
        chatId:
          readText(cf.lastRemoteChatId) ||
          readText(cf.lastResolvedChatId) ||
          `${c.phone}@c.us`,
      },
    ];
  } else {
    const entries = await collectCatalogContactEntries(deps, ws, {
      days: o?.days || 30,
      onlyCataloged: false,
    });
    targets = entries.slice(0, limit).map((e) => ({
      contactId: e.id,
      phone: e.phone,
      contactName: e.name || e.phone,
      chatId: e.lastRemoteChatId || e.lastResolvedChatId || `${e.phone}@c.us`,
    }));
  }
  let sched = 0;
  await forEachSequential(targets, async (t) => {
    await autopilotQueue.add(
      'score-contact',
      {
        workspaceId: ws,
        contactId: t.contactId,
        phone: t.phone,
        contactName: t.contactName,
        chatId: t.chatId || `${t.phone}@c.us`,
        reason,
      },
      { jobId: buildQueueJobId('score-contact', ws, t.contactId), removeOnComplete: true },
    );
    sched += 1;
  });
  return {
    scheduled: true,
    workspaceId: ws,
    reason,
    count: sched,
    contactId: o?.contactId || null,
    days: o?.days || 30,
    limit,
  };
}

export async function triggerBacklogRebuild(
  deps: CatalogDeps,
  ws: string,
  o?: { limit?: number; reason?: string },
) {
  const reason = String(o?.reason || 'manual_backlog_rebuild').trim();
  const limit = Math.max(1, Math.min(2000, Number(o?.limit || 500) || 500));
  const catchup = await deps.catchupService.runCatchupNow(ws, reason).catch((e: unknown) => ({
    scheduled: false,
    reason: String(e instanceof Error ? e.message : 'catchup_failed'),
  }));
  const run = await deps.ciaRuntime.startBacklogRun(ws, 'reply_all_recent_first', limit, {
    autoStarted: true,
    runtimeState: 'EXECUTING_BACKLOG',
    triggeredBy: reason,
  });
  return { workspaceId: ws, reason, limit, catchup, run };
}
