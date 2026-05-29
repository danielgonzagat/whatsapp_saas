import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { StructuredLogger } from '../../logging/structured-logger';
import { PrismaService } from '../../prisma/prisma.service';

export interface LeadGetArgs {
  leadId?: string;
  email?: string;
  phone?: string;
  limit?: number;
  [key: string]: unknown;
}

/**
 * LeadService — workspace-scoped lead retrieval from CheckoutSocialLead.
 *
 * domainService alias: LeadService.get
 * Workspace isolation: all queries filter by workspaceId.
 *
 * "Lead" maps to CheckoutSocialLead — a prospect who entered the checkout
 * funnel but may or may not have converted.
 */
@Injectable()
export class LeadService {
  private readonly logger = StructuredLogger.from(LeadService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Get lead(s) by ID, email, or phone. Returns list if no specific ID. */
  async get(
    workspaceId: string,
    args: LeadGetArgs,
  ): Promise<{ success: boolean; data: unknown }> {
    const limit = Math.min(Number(args.limit ?? 20), 100);

    if (args.leadId) {
      const lead = await this.prisma.checkoutSocialLead.findFirst({
        where: { id: String(args.leadId), workspaceId },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          cpf: true,
          status: true,
          stepReached: true,
          provider: true,
          utmSource: true,
          utmMedium: true,
          utmCampaign: true,
          convertedAt: true,
          createdAt: true,
          product: { select: { id: true, name: true } },
          plan: { select: { id: true, name: true } },
        },
      });
      this.logger.log(`LeadService.get ws=${workspaceId} leadId=${args.leadId}`);
      return { success: true, data: lead };
    }

    const where: Prisma.CheckoutSocialLeadWhereInput = { workspaceId };
    if (args.email) where.email = { contains: String(args.email), mode: 'insensitive' };
    if (args.phone) where.phone = { contains: String(args.phone) };

    const leads = await this.prisma.checkoutSocialLead.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        stepReached: true,
        convertedAt: true,
        createdAt: true,
        product: { select: { id: true, name: true } },
      },
    });

    this.logger.log(`LeadService.get ws=${workspaceId} count=${leads.length}`);
    return { success: true, data: leads };
  }
}
