import { randomInt, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AdminRole, Prisma } from '@prisma/client';
import { hash as bcryptHash } from 'bcrypt';
import { AuthService } from '../../auth/auth.service';
import { BCRYPT_ROUNDS } from '../../common/constants';
import { PrismaService } from '../../prisma/prisma.service';
import { getAdminAccountDetail, type AdminAccountDetail } from './queries/detail-account.query';
import {
  listAdminAccounts,
  type AdminAccountRow,
  type ListAccountsInput,
} from './queries/list-accounts.query';
import { listKycQueue, type KycQueueResult } from './queries/kyc-queue.query';
import { AdminKycService } from './kyc/admin-kyc.service';
import { adminErrors } from '../common/admin-api-errors';
import { asProviderSettings } from '../../whatsapp/provider-settings.types';
import { AdminAuditService } from '../audit/admin-audit.service';
import { AdminAccountStateAction } from './dto/update-account-state.dto';

export interface ListAccountsResponse {
  items: AdminAccountRow[];
  total: number;
}

@Injectable()
export class AdminAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly kyc: AdminKycService,
    private readonly audit: AdminAuditService,
  ) {}

  async list(input: ListAccountsInput): Promise<ListAccountsResponse> {
    return listAdminAccounts(this.prisma, input);
  }

  async detail(workspaceId: string): Promise<AdminAccountDetail> {
    const result = await getAdminAccountDetail(this.prisma, workspaceId);
    if (!result) throw adminErrors.userNotFound();
    return result;
  }

  async kycQueue(limit = 50): Promise<KycQueueResult> {
    return listKycQueue(this.prisma, limit);
  }

  async approveKyc(agentId: string, actorId: string, note?: string): Promise<void> {
    return this.kyc.approveAgent(agentId, actorId, note);
  }

  async rejectKyc(agentId: string, actorId: string, reason: string): Promise<void> {
    return this.kyc.rejectAgent(agentId, actorId, reason);
  }

  async reverifyKyc(agentId: string, actorId: string, reason: string): Promise<void> {
    return this.kyc.reverifyAgent(agentId, actorId, reason);
  }

  async updateState(
    workspaceId: string,
    actorId: string,
    action: AdminAccountStateAction,
    input: { reason?: string; frozenBalanceInCents?: number },
  ): Promise<void> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, providerSettings: true },
    });
    if (!workspace) throw adminErrors.userNotFound();

    const currentSettings = asProviderSettings(workspace.providerSettings);
    const currentAccountState =
      currentSettings.accountAdmin &&
      typeof currentSettings.accountAdmin === 'object' &&
      !Array.isArray(currentSettings.accountAdmin)
        ? (currentSettings.accountAdmin as Record<string, unknown>)
        : {};

    const nextAccountState: Record<string, unknown> = {
      ...currentAccountState,
      updatedAt: new Date().toISOString(),
      updatedBy: actorId,
    };

    if (action === AdminAccountStateAction.SUSPEND) {
      nextAccountState.suspended = true;
      nextAccountState.reason = input.reason?.trim() || 'Suspensão administrativa.';
    }
    if (action === AdminAccountStateAction.BLOCK) {
      nextAccountState.blocked = true;
      nextAccountState.reason = input.reason?.trim() || 'Bloqueio administrativo.';
    }
    if (action === AdminAccountStateAction.UNBLOCK) {
      nextAccountState.blocked = false;
      nextAccountState.reason = input.reason?.trim() || null;
    }
    if (action === AdminAccountStateAction.FREEZE) {
      nextAccountState.frozenBalanceInCents = Math.max(0, input.frozenBalanceInCents ?? 0);
      nextAccountState.reason = input.reason?.trim() || 'Saldo congelado manualmente.';
    }
    if (action === AdminAccountStateAction.UNFREEZE) {
      nextAccountState.frozenBalanceInCents = 0;
      nextAccountState.reason = input.reason?.trim() || null;
    }

    const nextSettings = {
      ...currentSettings,
      accountAdmin: nextAccountState,
    };

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        providerSettings: JSON.parse(JSON.stringify(nextSettings)) as Prisma.InputJsonValue,
      },
    });

    await this.audit.append({
      adminUserId: actorId,
      action: `admin.accounts.${action.toLowerCase()}`,
      entityType: 'Workspace',
      entityId: workspaceId,
      details: {
        workspaceName: workspace.name,
        action,
        reason: input.reason ?? null,
        frozenBalanceInCents: input.frozenBalanceInCents ?? null,
      },
    });
  }

  async bulkUpdateState(
    workspaceIds: string[],
    actorId: string,
    action: AdminAccountStateAction,
    input: { reason?: string; frozenBalanceInCents?: number },
  ): Promise<{ updated: number }> {
    let updated = 0;
    for (const workspaceId of workspaceIds) {
      await this.updateState(workspaceId, actorId, action, input);
      updated += 1;
    }
    return { updated };
  }

  async resetOwnerPassword(
    workspaceId: string,
    actorId: string,
    temporaryPassword?: string,
  ): Promise<{ ownerAgentId: string; ownerEmail: string; temporaryPassword: string }> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        agents: {
          where: { role: 'ADMIN' },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { id: true, email: true },
        },
      },
    });
    if (!workspace) throw adminErrors.userNotFound();

    const owner = workspace.agents[0];
    if (!owner) throw adminErrors.userNotFound();

    const nextPassword =
      temporaryPassword?.trim() ||
      `Kloel${randomInt(1000, 9999)}!${randomUUID().replace(/-/g, '').slice(0, 8)}`;

    const passwordHash = await bcryptHash(nextPassword, BCRYPT_ROUNDS);
    await this.prisma.agent.update({
      where: { id: owner.id },
      data: { password: passwordHash },
    });

    await this.audit.append({
      adminUserId: actorId,
      action: 'admin.accounts.owner_password_reset',
      entityType: 'Workspace',
      entityId: workspaceId,
      details: {
        workspaceName: workspace.name,
        ownerAgentId: owner.id,
        ownerEmail: owner.email,
      },
    });

    return {
      ownerAgentId: owner.id,
      ownerEmail: owner.email,
      temporaryPassword: nextPassword,
    };
  }

  async impersonateOwner(
    workspaceId: string,
    actorId: string,
    actorRole: AdminRole,
  ): Promise<Awaited<ReturnType<AuthService['issueTokensForAgentId']>>> {
    if (actorRole !== AdminRole.OWNER) {
      throw adminErrors.ownerRequired();
    }

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        agents: {
          where: { role: 'ADMIN' },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { id: true, email: true },
        },
      },
    });
    if (!workspace) throw adminErrors.userNotFound();

    const owner = workspace.agents[0];
    if (!owner) throw adminErrors.userNotFound();

    const session = await this.auth.issueTokensForAgentId(owner.id);

    await this.audit.append({
      adminUserId: actorId,
      action: 'admin.accounts.impersonated_owner',
      entityType: 'Workspace',
      entityId: workspaceId,
      details: {
        workspaceName: workspace.name,
        ownerAgentId: owner.id,
        ownerEmail: owner.email,
      },
    });

    return session;
  }
}
