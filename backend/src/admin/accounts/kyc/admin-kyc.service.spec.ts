import { Test, TestingModule } from '@nestjs/testing';
import { AdminKycService } from './admin-kyc.service';
import { AdminAuditService } from '../../audit/admin-audit.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('AdminKycService', () => {
  let service: AdminKycService;

  const actorId = 'admin_1';
  const agentId = 'agent_1';
  const workspaceId = 'ws_1';

  const mockAgentFindUnique = jest.fn<Promise<unknown>, unknown[]>();
  const mockAgentUpdateMany = jest.fn<Promise<unknown>, unknown[]>();
  const mockDocUpdateMany = jest.fn<Promise<unknown>, unknown[]>();
  const mockTransaction = jest.fn<Promise<unknown>, unknown[]>();

  const prismaMock = {
    agent: {
      findUnique: mockAgentFindUnique,
      updateMany: mockAgentUpdateMany,
    },
    kycDocument: {
      updateMany: mockDocUpdateMany,
    },
    $transaction: mockTransaction,
  };

  const mockAudit = {
    append: jest.fn<Promise<void>, unknown[]>(),
  };

  const agentRecord = {
    id: agentId,
    workspaceId,
    kycStatus: 'submitted' as const,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockAgentFindUnique.mockResolvedValue(agentRecord);
    mockAgentUpdateMany.mockResolvedValue({ count: 1 });
    mockDocUpdateMany.mockResolvedValue({ count: 1 });
    mockAudit.append.mockResolvedValue(undefined);

    mockTransaction.mockImplementation(async (ops: unknown) => {
      if (typeof ops === 'function') {
        return ops(prismaMock);
      }
      return { count: 1 };
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminKycService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AdminAuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get(AdminKycService);
  });

  describe('approveAgent', () => {
    it('sets kycStatus to approved and updates pending documents', async () => {
      await service.approveAgent(agentId, actorId, 'good docs');

      expect(mockAgentUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: agentId, workspaceId },
          data: expect.objectContaining({
            kycStatus: 'approved',
            kycRejectedReason: null,
          }),
        }),
      );
      expect(mockDocUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { agentId, workspaceId, status: 'pending' },
          data: expect.objectContaining({ status: 'approved' }),
        }),
      );
    });

    it('writes audit log on approval', async () => {
      await service.approveAgent(agentId, actorId, 'good docs');

      expect(mockAudit.append).toHaveBeenCalledWith(
        expect.objectContaining({
          adminUserId: actorId,
          action: 'admin.kyc.approved',
          entityType: 'Agent',
          entityId: agentId,
          details: expect.objectContaining({
            workspaceId,
            previousStatus: 'submitted',
            note: 'good docs',
          }),
        }),
      );
    });

    it('works with undefined note', async () => {
      await service.approveAgent(agentId, actorId, undefined);

      expect(mockAudit.append).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({ note: null }),
        }),
      );
    });

    it('throws when agent not found', async () => {
      mockAgentFindUnique.mockResolvedValueOnce(null);

      await expect(service.approveAgent('unknown', actorId, 'ok')).rejects.toThrow(
        /n.o encontrado/i,
      );
    });

    it('preserves workspace isolation via workspaceId in where clause', async () => {
      const otherWsAgent = { id: 'agent_2', workspaceId: 'ws_2', kycStatus: 'submitted' as const };
      mockAgentFindUnique.mockResolvedValueOnce(otherWsAgent);

      await service.approveAgent('agent_2', actorId, 'ok');

      expect(mockAgentUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'agent_2', workspaceId: 'ws_2' },
        }),
      );
      expect(mockDocUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { agentId: 'agent_2', workspaceId: 'ws_2', status: 'pending' },
        }),
      );
    });

    it('does not log document content in audit trail', async () => {
      // KYC service audits workspaceId + previousStatus, never document content
      await service.approveAgent(agentId, actorId, 'approved');

      const appendCall = mockAudit.append.mock.calls[0]?.[0] as Record<string, unknown>;
      const details = appendCall?.details as Record<string, unknown>;
      expect(details).toHaveProperty('workspaceId');
      expect(details).toHaveProperty('previousStatus');
      expect(details).not.toHaveProperty('documents');
      expect(details).not.toHaveProperty('documentContent');
    });
  });

  describe('rejectAgent', () => {
    it('sets kycStatus to rejected with a reason', async () => {
      await service.rejectAgent(agentId, actorId, 'invalid docs');

      expect(mockAgentUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            kycStatus: 'rejected',
            kycRejectedReason: 'invalid docs',
            kycApprovedAt: null,
          }),
        }),
      );
      expect(mockDocUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'rejected',
            rejectedReason: 'invalid docs',
          }),
        }),
      );
    });

    it('writes audit log on rejection', async () => {
      await service.rejectAgent(agentId, actorId, 'fraud');

      expect(mockAudit.append).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'admin.kyc.rejected',
          details: expect.objectContaining({ reason: 'fraud' }),
        }),
      );
    });

    it('throws when agent not found', async () => {
      mockAgentFindUnique.mockResolvedValueOnce(null);

      await expect(service.rejectAgent('unknown', actorId, 'nope')).rejects.toThrow(
        /n.o encontrado/i,
      );
    });
  });

  describe('reverifyAgent', () => {
    it('sets kycStatus back to pending', async () => {
      mockAgentFindUnique.mockResolvedValueOnce({
        ...agentRecord,
        kycStatus: 'rejected' as const,
      });

      await service.reverifyAgent(agentId, actorId, 'resubmit');

      expect(mockAgentUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: agentId, workspaceId },
          data: expect.objectContaining({
            kycStatus: 'pending',
            kycSubmittedAt: null,
            kycApprovedAt: null,
            kycRejectedReason: 'resubmit',
          }),
        }),
      );
    });

    it('writes audit log on reverification', async () => {
      mockAgentFindUnique.mockResolvedValueOnce({
        ...agentRecord,
        kycStatus: 'rejected' as const,
      });

      await service.reverifyAgent(agentId, actorId, 'new docs needed');

      expect(mockAudit.append).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'admin.kyc.reverification_requested',
          details: expect.objectContaining({
            previousStatus: 'rejected',
            reason: 'new docs needed',
          }),
        }),
      );
    });

    it('throws when agent not found', async () => {
      mockAgentFindUnique.mockResolvedValueOnce(null);

      await expect(service.reverifyAgent('unknown', actorId, 'try again')).rejects.toThrow(
        /n.o encontrado/i,
      );
    });
  });

  describe('prisma errors', () => {
    it('propagates database errors from findUnique', async () => {
      mockAgentFindUnique.mockRejectedValueOnce(new Error('DB down'));

      await expect(service.approveAgent(agentId, actorId, 'ok')).rejects.toThrow('DB down');
    });

    it('propagates database errors from $transaction', async () => {
      mockTransaction.mockRejectedValueOnce(new Error('transaction failed'));

      await expect(service.approveAgent(agentId, actorId, 'ok')).rejects.toThrow(
        'transaction failed',
      );
    });
  });
});
