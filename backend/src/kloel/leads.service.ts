import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { PrismaService } from '../prisma/prisma.service';
import { clampLimit } from '../common/pagination-clamp.pipe';
import { isLeadsReadContactEnabled } from './leads-read-contact.flag';

type LeadRow = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  status: string | null;
  stage: string | null;
  lastIntent: string | null;
  totalMessages: number | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date | null;
};

type LeadOutput = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  status: string;
  stage: string | null;
  lastIntent: string;
  totalMessages: number;
  lastInteraction: Date;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date | null;
  commercialScore: number | null;
};

const COMMERCIAL_SCORE_SIGNALS: Record<string, number> = {
  purchase_intent: 0.8,
  checkout_started: 0.7,
  consultation: 0.5,
  support: 0.1,
  general: 0.2,
};

function computeCommercialScore(lead: LeadRow): number | null {
  const intent = (lead.lastIntent || 'general').toLowerCase();
  const messages = lead.totalMessages ?? 0;
  if (messages === 0) {
    return null;
  }

  const intentScore =
    COMMERCIAL_SCORE_SIGNALS[intent] ??
    (intent.includes('purchase') || intent.includes('compra')
      ? 0.75
      : intent.includes('price') || intent.includes('preco')
        ? 0.6
        : 0.15);

  const engagementBonus = Math.min((messages / 20) * 0.15, 0.15);
  const recencyDays = (Date.now() - (lead.updatedAt ?? lead.createdAt).getTime()) / (86400 * 1000);
  const recencyPenalty = Math.min(recencyDays / 90, 0.3);

  return Math.round(Math.min(Math.max(intentScore + engagementBonus - recencyPenalty, 0), 1) * 100);
}

function mapLead(lead: LeadRow): LeadOutput {
  return {
    id: lead.id,
    phone: lead.phone,
    name: lead.name,
    email: lead.email,
    status: lead.status || 'new',
    stage: lead.stage ?? null,
    lastIntent: lead.lastIntent || 'general',
    totalMessages: lead.totalMessages || 0,
    lastInteraction: lead.updatedAt || lead.createdAt,
    metadata: lead.metadata || {},
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    commercialScore: computeCommercialScore(lead),
  };
}

/** Leads service with commercial scoring. */
@Injectable()
export class LeadsService {
  private readonly logger = StructuredLogger.from(LeadsService.name);

  constructor(private readonly prisma: PrismaService) {
    this.logger.log('LeadsService initialized');
  }

  /**
   * List leads with optional commercial scoring.
   *
   * Reader source is flag-gated (Lead–Contact duplication family, STEP 6).
   * Flag OFF (default, `KLOEL_LEADS_READ_CONTACT` unset/non-`'true'`) is
   * BYTE-IDENTICAL to the legacy behaviour: the legacy `RAC_KloelLead` read only,
   * with no Contact query issued. Flag ON reads from the canonical `Contact`
   * (joined on `workspaceId`, funnel snapshot mapped onto `LeadOutput`); on an
   * EMPTY canonical result it FALLS BACK to the legacy `RAC_KloelLead` read so a
   * not-yet-backfilled workspace never surfaces an empty lead list.
   */
  async listLeads(
    workspaceId: string,
    options?: { status?: string; search?: string; limit?: number },
  ) {
    if (isLeadsReadContactEnabled()) {
      const fromContact = await this.listLeadsFromContact(workspaceId, options);
      if (fromContact.length > 0) {
        return fromContact;
      }
      // EMPTY canonical result → fall back to the still-authoritative legacy read.
    }
    return this.listLeadsFromKloelLead(workspaceId, options);
  }

  /** Legacy reader: list leads from the authoritative `RAC_KloelLead` table. */
  private async listLeadsFromKloelLead(
    workspaceId: string,
    options?: { status?: string; search?: string; limit?: number },
  ) {
    const limit = clampLimit(options?.limit, { default: 200, max: 500 });

    const statusFilter = options?.status ? { status: options.status } : {};
    const search = options?.search?.trim();

    const leads = await this.prisma.kloelLead.findMany({
      where: {
        workspaceId,
        ...statusFilter,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        phone: true,
        name: true,
        email: true,
        status: true,
        stage: true,
        lastIntent: true,
        totalMessages: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return leads.map((lead) => mapLead(lead));
  }

  /**
   * Canonical reader: list leads from `RAC_Contact`, mapping the denormalized
   * funnel snapshot (`leadStatus`/`leadStage`/`lastIntent`/`totalMessages`) onto
   * the existing `LeadOutput`. Field-compatible with the legacy reader. The
   * status filter matches `leadStatus`; `customFields` carries the metadata blob.
   */
  private async listLeadsFromContact(
    workspaceId: string,
    options?: { status?: string; search?: string; limit?: number },
  ): Promise<LeadOutput[]> {
    const limit = clampLimit(options?.limit, { default: 200, max: 500 });

    const statusFilter = options?.status ? { leadStatus: options.status } : {};
    const search = options?.search?.trim();

    const contacts = await this.prisma.contact.findMany({
      where: {
        workspaceId,
        ...statusFilter,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        phone: true,
        name: true,
        email: true,
        leadStatus: true,
        leadStage: true,
        lastIntent: true,
        totalMessages: true,
        customFields: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return contacts.map((contact) =>
      mapLead({
        id: contact.id,
        phone: contact.phone,
        name: contact.name,
        email: contact.email,
        status: contact.leadStatus,
        stage: contact.leadStage,
        lastIntent: contact.lastIntent,
        totalMessages: contact.totalMessages,
        metadata: contact.customFields,
        createdAt: contact.createdAt,
        updatedAt: contact.updatedAt,
      }),
    );
  }
}
