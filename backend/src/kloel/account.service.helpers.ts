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
export function requireDefinedFiscalType(patch: FiscalDataPatch, existingType: unknown): string {
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

/** Normalizes a possibly-`unknown` field to a trimmed non-empty string, or `undefined`. */
function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Allowed PIX key types stored on the bank account record. */
export const PIX_KEY_TYPES = ['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'RANDOM'] as const;
export type PixKeyType = (typeof PIX_KEY_TYPES)[number];

/** Maps human/agent PIX-key-type aliases to the canonical stored value. */
export function normalizePixKeyType(value: unknown): PixKeyType | undefined {
  const raw = optionalString(value);
  if (!raw) {
    return undefined;
  }
  const upper = raw.toUpperCase();
  const aliases: Record<string, PixKeyType> = {
    CPF: 'CPF',
    CNPJ: 'CNPJ',
    EMAIL: 'EMAIL',
    'E-MAIL': 'EMAIL',
    PHONE: 'PHONE',
    CELULAR: 'PHONE',
    TELEFONE: 'PHONE',
    RANDOM: 'RANDOM',
    ALEATÓRIA: 'RANDOM',
    ALEATORIA: 'RANDOM',
  };
  return aliases[upper];
}

/** Parsed bank-account patch derived from agent/resolver args. */
export interface BankAccountPatch {
  bankCode?: string;
  agency?: string;
  account?: string;
  pixKey?: string;
  pixKeyType?: PixKeyType;
}

/**
 * Builds the bank-account field patch from a free-form args record. Only known
 * payout/KYC DATA fields are kept — no money fields, no float, no transfer.
 */
export function bankAccountPatch(data: Record<string, unknown>): BankAccountPatch {
  const patch: BankAccountPatch = {};
  const bankCode = optionalString(data.bankCode);
  const agency = optionalString(data.agency);
  const account = optionalString(data.account);
  const pixKey = optionalString(data.pixKey);
  const pixKeyType = normalizePixKeyType(data.pixKeyType);
  if (bankCode !== undefined) {
    patch.bankCode = bankCode;
  }
  if (agency !== undefined) {
    patch.agency = agency;
  }
  if (account !== undefined) {
    patch.account = account;
  }
  if (pixKey !== undefined) {
    patch.pixKey = pixKey;
  }
  if (pixKeyType !== undefined) {
    patch.pixKeyType = pixKeyType;
  }
  return patch;
}

/**
 * Derives the masked display string for a stored bank account: last 4 digits
 * of the account number (or PIX key) like `****1234`, or `null` when neither
 * is present. Mirrors the KYC `deriveDisplayAccount` contract.
 */
export function deriveBankDisplay(patch: { account?: string; pixKey?: string }): string | null {
  const last4 = patch.account?.slice(-4) || patch.pixKey?.slice(-4) || '';
  return last4 ? `****${last4}` : null;
}
