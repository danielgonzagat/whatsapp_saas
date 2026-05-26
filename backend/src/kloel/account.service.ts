import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  async updatePersonalData(workspaceId: string, data: { name?: string; email?: string; phone?: string }) {
    const updates: Record<string, unknown> = {};
    if (data.name) updates.name = data.name;
    if (data.email) updates.email = data.email;
    if (data.phone) updates.phone = data.phone;
    await this.prisma.workspace.update({ where: { id: workspaceId }, data: updates });
    return { success: true, message: 'Personal data updated' };
  }

  async getFiscalData(workspaceId: string) {
    const fiscal = await this.prisma.fiscalData.findUnique({ where: { workspaceId } });
    return { success: true, data: { fiscal } };
  }

  async updateFiscalData(workspaceId: string, data: Record<string, unknown>) {
    const doc = await this.prisma.fiscalData.upsert({
      where: { workspaceId },
      create: { workspaceId, ...data as any },
      update: { ...data as any },
    });
    return { success: true, fiscal: doc };
  }

  async getSettings(workspaceId: string) {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, providerSettings: true },
    });
    return { success: true, data: ws };
  }
}
