import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  type BankAccountPatch,
  bankAccountPatch,
  buildFiscalDataCreateInput,
  buildPersonalDataUpdates,
  deriveBankDisplay,
  fiscalDataPatch,
  normalizePixKeyType,
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

  /**
   * Stores/updates the workspace's payout BANK ACCOUNT data. This is a KYC/
   * payout DATA write only — it moves NO money and triggers no transfer.
   *
   * Workspace-isolated and idempotent: inside a transaction it updates the
   * existing default {@link BankAccount} row when present, otherwise creates
   * one (marked default). Replaying the same payload converges to the same
   * row, so a duplicate call does not create a second account.
   *
   * Accepts the `(workspaceId, args)` resolver signature. Recognized DATA
   * fields: `bankCode`, `agency`, `account` (and, when supplied, `pixKey` /
   * `pixKeyType`). `bankName` is preserved on update or defaulted to the bank
   * code / "Banco" on first create (the column is non-nullable).
   */
  async updateBankAccount(workspaceId: string, args: Record<string, unknown>) {
    const patch = bankAccountPatch(args);
    if (!patch.bankCode && !patch.agency && !patch.account) {
      return {
        success: false,
        error: 'Informe ao menos código do banco, agência ou conta.',
      };
    }
    const record = await this.upsertDefaultBankAccount(workspaceId, patch, args);
    return { success: true, message: 'Dados bancários atualizados', bankAccount: record };
  }

  /**
   * Stores/updates the workspace's PIX key for payouts. KYC/payout DATA write
   * only — no money movement. Idempotent and workspace-isolated via the same
   * default-bank-account upsert path used by {@link updateBankAccount}.
   *
   * Validates `pixKeyType` against the allowed set; rejects an unknown type
   * with an honest error rather than storing garbage.
   */
  async setPixKey(workspaceId: string, args: Record<string, unknown>) {
    const pixKey = typeof args.pixKey === 'string' ? args.pixKey.trim() : '';
    if (!pixKey) {
      return { success: false, error: 'Parâmetro obrigatório: pixKey.' };
    }
    const pixKeyType = normalizePixKeyType(args.pixKeyType);
    if (args.pixKeyType !== undefined && !pixKeyType) {
      return {
        success: false,
        error: 'Tipo de chave PIX inválido. Use CPF, CNPJ, email, celular ou aleatória.',
      };
    }
    const patch: BankAccountPatch = { pixKey, ...(pixKeyType ? { pixKeyType } : {}) };
    const record = await this.upsertDefaultBankAccount(workspaceId, patch, args);
    return { success: true, message: 'Chave PIX cadastrada', bankAccount: record };
  }

  /**
   * Shared idempotent upsert of the workspace's DEFAULT bank account. Updates
   * the existing default row when present (preserving prior `bankName`),
   * otherwise creates one with a derived non-null `bankName`. Transactional +
   * workspace-isolated; never deletes or overwrites history beyond the single
   * default payout record this capability owns.
   */
  private async upsertDefaultBankAccount(
    workspaceId: string,
    patch: BankAccountPatch,
    rawArgs: Record<string, unknown>,
  ) {
    const displayAccount = deriveBankDisplay(patch);
    const providedBankName =
      typeof rawArgs.bankName === 'string' && rawArgs.bankName.trim().length > 0
        ? rawArgs.bankName.trim()
        : undefined;
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.bankAccount.findFirst({
          where: { workspaceId, isDefault: true },
          select: { id: true },
        });
        if (existing) {
          return tx.bankAccount.update({
            where: { id: existing.id, workspaceId },
            data: {
              ...patch,
              ...(providedBankName ? { bankName: providedBankName } : {}),
              ...(displayAccount ? { displayAccount } : {}),
            },
          });
        }
        const bankName = providedBankName ?? patch.bankCode ?? 'Banco';
        return tx.bankAccount.create({
          data: {
            workspaceId,
            bankName,
            ...patch,
            isDefault: true,
            displayAccount,
          },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }
}
