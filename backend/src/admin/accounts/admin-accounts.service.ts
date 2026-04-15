import { Injectable } from '@nestjs/common';
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

export interface ListAccountsResponse {
  items: AdminAccountRow[];
  total: number;
}

@Injectable()
export class AdminAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kyc: AdminKycService,
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
}
