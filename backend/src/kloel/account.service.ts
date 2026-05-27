import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
const FISCAL_DATA_STRING_FIELDS = [
  'type',
  'cpf',
  'fullName',
  'cnpj',
  'razaoSocial',
  'nomeFantasia',
  'inscricaoEstadual',
  'inscricaoMunicipal',
  'responsavelCpf',
  'responsavelNome',
  'cep',
  'street',
  'number',
  'complement',
  'neighborhood',
  'city',
  'state',
  'status',
] as const;

type FiscalDataStringField = (typeof FISCAL_DATA_STRING_FIELDS)[number];

type FiscalDataPatch = Partial<Record<FiscalDataStringField, string>>;

function fiscalDataPatch(data: Record<string, unknown>): FiscalDataPatch {
  const patch: FiscalDataPatch = {};
  for (const field of FISCAL_DATA_STRING_FIELDS) {
    const value = data[field];
    if (typeof value === 'string') {
      patch[field] = value;
    }
  }
  return patch;
}

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  async updatePersonalData(
    workspaceId: string,
    data: { name?: string; email?: string; phone?: string },
  ) {
    const updates: Record<string, unknown> = {};
    if (data.name) {
      updates.name = data.name;
    }
    if (data.email) {
      updates.email = data.email;
    }
    if (data.phone) {
      updates.phone = data.phone;
    }
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
    const type = patch.type ?? existing?.type;

    if (typeof type !== 'string') {
      throw new BadRequestException('Fiscal type is required');
    }

    const createData: Prisma.FiscalDataUncheckedCreateInput = {
      workspaceId,
      ...patch,
      type,
    };
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
