import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildFiscalDataCreateInput,
  buildPersonalDataUpdates,
  fiscalDataPatch,
  requireDefinedFiscalType,
} from './account.service.helpers';
@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  async updatePersonalData(
    workspaceId: string,
    data: { name?: string; email?: string; phone?: string },
  ) {
    const updates = buildPersonalDataUpdates(data);
    await this.prisma.workspace.update({ where: { id: workspaceId }, data: updates });
    return { success: true, message: 'Personal data updated' };
  }

  async getFiscalData(workspaceId: string) {
    const fiscal = await this.prisma.fiscalData.findUnique({ where: { workspaceId } });
    return { success: true, data: { fiscal } };
  }

  async updateFiscalData(workspaceId: string, data: Record<string, unknown>) {
    const patch = fiscalDataPatch(data);
    const existing = await this.prisma.fiscalData.findUnique({
      where: { workspaceId },
      select: { type: true },
    });
    const type = requireDefinedFiscalType(patch, existing?.type);

    const createData = buildFiscalDataCreateInput(workspaceId, patch, type);
    const updateData: Prisma.FiscalDataUncheckedUpdateInput = patch;

    const doc = await this.prisma.fiscalData.upsert({
      where: { workspaceId },
      create: createData,
      update: updateData,
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
