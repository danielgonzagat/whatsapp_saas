import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Leads service. */
@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  async listLeads(
    workspaceId: string,
    options?: { status?: string; search?: string; limit?: number },
  ) {
    const limit = Math.min(Math.max(options?.limit ?? 200, 1), 500);

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
        lastIntent: true,
        totalMessages: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return leads.map((lead) => ({
      id: lead.id,
      phone: lead.phone,
      name: lead.name,
      email: lead.email,
      status: lead.status || 'new',
      lastIntent: lead.lastIntent || 'general',
      totalMessages: lead.totalMessages || 0,
      lastInteraction: lead.updatedAt || lead.createdAt,
      metadata: lead.metadata || {},
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
    }));
  }
}
