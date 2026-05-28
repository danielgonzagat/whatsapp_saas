import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
export const FISCAL_DATA_STRING_FIELDS = [
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

export type FiscalDataStringField = (typeof FISCAL_DATA_STRING_FIELDS)[number];

export type FiscalDataPatch = Partial<Record<FiscalDataStringField, string>>;
export function isFiscalDataStringField(field: string): field is FiscalDataStringField {
  return (FISCAL_DATA_STRING_FIELDS as readonly string[]).includes(field);
}
export function fiscalDataPatch(data: Record<string, unknown>): FiscalDataPatch {
  const patch: FiscalDataPatch = {};
  for (const field of FISCAL_DATA_STRING_FIELDS) {
    const value = data[field];
    if (typeof value === 'string') {
      patch[field] = value;
    }
  }
  return patch;
}
export function requireDefinedFiscalType(
  patch: FiscalDataPatch,
  existingType: unknown,
): string {
  const type = patch.type ?? existingType;
  if (typeof type !== 'string') {
    throw new BadRequestException('Fiscal type is required');
  }
  return type;
}
export function buildFiscalDataCreateInput(
  workspaceId: string,
  patch: FiscalDataPatch,
  type: string,
): Prisma.FiscalDataUncheckedCreateInput {
  return {
    workspaceId,
    ...patch,
    type,
  };
}
export function buildPersonalDataUpdates(data: {
  name?: string;
  email?: string;
  phone?: string;
}): Record<string, unknown> {
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
  return updates;
}
