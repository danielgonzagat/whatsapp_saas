import { Injectable, Logger } from '@nestjs/common';
import { forEachSequential } from '../common/async-sequence';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Campaign money-report, revenue events, and recent-action queries for Autopilot.
 * Extracted from AutopilotAnalyticsService to keep each file under 400 lines.
 */
@Injectable()
export class AutopilotAnalyticsReportService {
  private readonly logger = new Logger(AutopilotAnalyticsReportService.name);

  constructor(private readonly prisma: PrismaService) {}

  private readRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  }

  private readOptionalText(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
  }

  /**
   * Relatório de campanhas Money Machine (7d) com receita atribuída por telefone.
   */
  async getMoneyReport(workspaceId: string) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const campaigns = await this.prisma.campaign.findMany({
      where: { workspaceId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const dealsWon = await this.prisma.deal.findMany({
      where: {
        status: 'WON',
        updatedAt: { gte: since },
        contact: { workspaceId },
      },
      select: { value: true },
      take: 1000,
    });
    const revenueFromDeals = dealsWon.reduce((acc, d) => acc + (Number(d.value) || 0), 0);

    const invoices = await this.prisma.invoice.findMany({
      where: { workspaceId, status: 'PAID', createdAt: { gte: since } },
      select: { amount: true },
      take: 1000,
    });
    const revenueFromInvoices = invoices.reduce((acc, inv) => acc + (Number(inv.amount) || 0), 0);

    let conversions = 0;
    try {
      conversions = await this.prisma.autopilotEvent.count({
        where: {
          workspaceId,
          action: 'CONVERSION',
          createdAt: { gte: since },
        },
      });
    } catch {
      // optional table
    }

    const rows: Array<{
      id: string;
      name: string;
      status: string;
      createdAt: Date;
      phones: number;
      revenue: number;
      deals: number;
    }> = [];

    await forEachSequential(campaigns, async (camp) => {
      const filters = (camp.filters as Record<string, unknown>) || {};
      const phones: string[] = Array.isArray(filters.phones) ? (filters.phones as string[]) : [];
      let revenue = 0;
      let deals = 0;

      // PULSE:OK — each campaign has unique JSON path filter on customFields; cannot batch
      const taggedContacts = await this.prisma.contact.findMany({
        take: 500,
        where: {
          workspaceId,
          customFields: { path: ['lastCampaignId'], equals: camp.id },
        },
        select: { id: true },
      });

      const contactIds =
        taggedContacts.length > 0
          ? taggedContacts.map((c) => c.id)
          : phones.length
            ? (
                await this.prisma.contact.findMany({
                  take: 500,
                  where: { workspaceId, phone: { in: phones } },
                  select: { id: true },
                })
              ).map((c) => c.id)
            : [];

      const directAgg = await this.prisma.deal.aggregate({
        where: {
          status: 'WON',
          updatedAt: { gte: since },
          sourceCampaignId: camp.id,
          contact: { workspaceId },
        },
        _sum: { value: true },
        _count: { id: true },
      });
      revenue = directAgg._sum?.value || 0;
      deals = directAgg._count?.id || 0;

      if (deals === 0) {
        const evs = await this.prisma.autopilotEvent.findMany({
          take: 1000,
          where: {
            workspaceId,
            action: { in: ['DEAL_WON', 'DEAL_WON_STAGE'] },
            createdAt: { gte: since },
            meta: { path: ['campaignId'], equals: camp.id },
          },
          select: { meta: true },
        });
        if (evs.length) {
          revenue += evs.reduce(
            (acc, e) => acc + (Number((e.meta as Record<string, unknown>)?.value) || 0),
            0,
          );
          deals += evs.length;
        }
      }

      if (deals === 0 && revenue === 0 && contactIds.length) {
        const agg = await this.prisma.deal.aggregate({
          where: {
            status: 'WON',
            updatedAt: { gte: since },
            contactId: { in: contactIds },
          },
          _sum: { value: true },
          _count: { id: true },
        });
        revenue = agg._sum?.value || 0;
        deals = agg._count?.id || 0;
      }

      rows.push({
        id: camp.id,
        name: camp.name,
        status: camp.status,
        createdAt: camp.createdAt,
        phones: phones.length,
        revenue,
        deals,
      });
    });

    return {
      campaigns: rows,
      summary: {
        revenueFromDeals,
        revenueFromInvoices,
        conversionsLast7d: conversions,
      },
    };
  }

  /**
   * Lista eventos de receita (deals ganhos) dos últimos 7 dias.
   */
  async getRevenueEvents(workspaceId: string, limit = 20) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const max = Math.min(Math.max(limit, 5), 200);
    const events: Array<{
      at: Date;
      campaignId: string;
      value: number;
      action: string;
      source: string;
    }> = [];

    try {
      const ev = await this.prisma.autopilotEvent.findMany({
        where: {
          workspaceId,
          action: { in: ['DEAL_WON', 'DEAL_WON_STAGE', 'CONVERSION'] },
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'desc' },
        take: max,
        select: { createdAt: true, meta: true, action: true },
      });
      events.push(
        ...ev.map((e) => {
          const meta = (e.meta as Record<string, unknown>) || {};
          return {
            at: e.createdAt,
            campaignId: typeof meta.campaignId === 'string' ? meta.campaignId : '',
            value: Number(meta.value || 0),
            action: e.action,
            source: typeof meta.source === 'string' ? meta.source : '',
          };
        }),
      );
    } catch {
      // optional table
    }

    if (events.length === 0) {
      const dealsWon = await this.prisma.deal.findMany({
        where: {
          status: 'WON',
          updatedAt: { gte: since },
          contact: { workspaceId },
        },
        orderBy: { updatedAt: 'desc' },
        take: max,
        select: {
          updatedAt: true,
          value: true,
          stage: { select: { pipeline: true } },
        },
      });
      events.push(
        ...dealsWon.map((d) => ({
          at: d.updatedAt,
          campaignId: '',
          value: Number(d.value || 0),
          action: 'DEAL_WON',
          source: 'deal',
        })),
      );
    }

    const totalRevenue = events.reduce((acc, ev) => acc + (ev.value || 0), 0);
    const totalDeals = events.length;

    return { events, totalRevenue, totalDeals };
  }

  /**
   * Lista ações recentes do Autopilot (para debug/UX).
   */
  async getRecentActions(workspaceId: string, limit = 30, status?: string) {
    const events = await this.prisma.autopilotEvent.findMany({
      where: {
        workspaceId,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 5), 100),
      select: {
        createdAt: true,
        contactId: true,
        intent: true,
        action: true,
        status: true,
        reason: true,
        meta: true,
      },
    });

    const contactIds = Array.from(new Set(events.map((l) => l.contactId).filter(Boolean)));
    const contacts = await this.prisma.contact.findMany({
      take: 5000,
      where: { id: { in: contactIds }, workspaceId },
      select: { id: true, phone: true, name: true, customFields: true },
    });
    const map = new Map(contacts.map((c) => [c.id, c]));

    return events.map((l) => this.serializeRecentAction(l, map));
  }

  serializeRecentAction(
    event: {
      createdAt: Date;
      contactId: string | null;
      intent: string | null;
      action: string | null;
      status: string | null;
      reason: string | null;
      meta: unknown;
    },
    contactMap: Map<
      string,
      {
        id: string;
        phone: string | null;
        name: string | null;
        customFields: unknown;
      }
    >,
  ) {
    const contact = event.contactId ? contactMap.get(event.contactId) : null;
    const nextRetryAt = this.readOptionalText(
      this.readRecord(contact?.customFields).autopilotNextRetryAt,
    );
    const meta = this.readRecord(event.meta);
    return {
      createdAt: event.createdAt,
      contact: contact?.name || contact?.phone || event.contactId,
      contactId: event.contactId,
      contactPhone: contact?.phone || null,
      action: event.action || 'UNKNOWN',
      intent: event.intent || 'UNKNOWN',
      status: event.status || 'executed',
      reason: event.reason || '',
      nextRetryAt,
      intentConfidence: meta?.confidence ?? meta?.intentConfidence ?? null,
      meta: event.meta || null,
    };
  }
}
