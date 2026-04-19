import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hashAuthToken } from '../auth/auth-token-hash';
import { EmailService } from '../auth/email.service';
import { ComplianceService } from './compliance.service';
import { validateSignedRequest } from './utils/signed-request.validator';
import { validateSecurityEventToken } from './utils/jwt-set.validator';

jest.mock('./utils/signed-request.validator', () => ({
  validateSignedRequest: jest.fn(),
}));

jest.mock('./utils/jwt-set.validator', () => ({
  createGoogleRiscJwks: jest.fn(() => jest.fn()),
  validateSecurityEventToken: jest.fn(),
}));

describe('ComplianceService', () => {
  const prisma = {
    dataDeletionRequest: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    riscEvent: {
      create: jest.fn(),
      update: jest.fn(),
    },
    agent: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    socialAccount: {
      deleteMany: jest.fn(),
      findMany: jest.fn(),
    },
    refreshToken: {
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
    auditLog: {
      findMany: jest.fn(),
    },
    message: {
      findMany: jest.fn(),
    },
    workspace: {
      findUnique: jest.fn(),
    },
    agentComplianceState: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const config = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        META_APP_SECRET: 'meta-app-secret',
        FRONTEND_URL: 'https://kloel.com',
        GOOGLE_CLIENT_ID: 'google-client-id.apps.googleusercontent.com',
      };

      return values[key];
    }),
  };

  const emailService = {
    sendDataDeletionConfirmationEmail: jest.fn(),
  };

  let service: ComplianceService;

  beforeEach(() => {
    jest.clearAllMocks();
    emailService.sendDataDeletionConfirmationEmail.mockResolvedValue(true);
    service = new ComplianceService(prisma as never, config as never, emailService as never);
  });

  it('creates a facebook data deletion request and returns a status URL', async () => {
    (validateSignedRequest as jest.Mock).mockReturnValue({
      algorithm: 'HMAC-SHA256',
      user_id: 'facebook-user-123',
    });
    prisma.agent.findFirst.mockResolvedValue(null);
    prisma.dataDeletionRequest.create.mockResolvedValue({
      id: 'delreq-1',
      confirmationCode: hashAuthToken('CONFIRM123456789'),
    });

    const result = await service.createFacebookDeletionRequest('signed-request-payload');

    expect(validateSignedRequest).toHaveBeenCalledWith('signed-request-payload', 'meta-app-secret');
    expect(prisma.dataDeletionRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: 'facebook',
          providerUserId: 'facebook-user-123',
          status: 'completed',
          completedAt: expect.any(Date),
          confirmationCode: expect.stringMatching(/^[a-f0-9]{64}$/),
          rawPayload: expect.objectContaining({
            algorithm: 'HMAC-SHA256',
            user_id: 'facebook-user-123',
          }),
        }),
      }),
    );
    expect(result).toEqual({
      confirmation_code: expect.stringMatching(/^[A-Za-z0-9]{14,16}$/),
      url: expect.stringMatching(/^https:\/\/kloel\.com\/data-deletion\/status\/[A-Za-z0-9]{14,16}$/),
    });
    const storedCode = prisma.dataDeletionRequest.create.mock.calls[0][0].data.confirmationCode;
    expect(storedCode).not.toBe(result.confirmation_code);
    expect(storedCode).toBe(hashAuthToken(result.confirmation_code));
  });

  it('completes a facebook deletion request immediately when the provider identity matches an existing agent', async () => {
    (validateSignedRequest as jest.Mock).mockReturnValue({
      algorithm: 'HMAC-SHA256',
      user_id: 'facebook-user-123',
    });
    prisma.agent.findFirst.mockResolvedValue({
      id: 'agent-1',
      email: 'user@kloel.com',
      name: 'Meta User',
      provider: 'facebook',
      providerId: 'facebook-user-123',
    });
    prisma.dataDeletionRequest.create.mockResolvedValue({
      id: 'delreq-2',
      confirmationCode: hashAuthToken('CONFIRM123456789'),
    });

    const result = await service.createFacebookDeletionRequest('signed-request-payload');

    expect(prisma.dataDeletionRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: 'facebook',
          providerUserId: 'facebook-user-123',
          agentId: 'agent-1',
          status: 'processing',
        }),
      }),
    );
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { agentId: 'agent-1', revoked: false },
      data: { revoked: true },
    });
    expect(prisma.socialAccount.deleteMany).toHaveBeenCalledWith({
      where: { agentId: 'agent-1' },
    });
    expect(prisma.agent.update).toHaveBeenCalledWith({
      where: { id: 'agent-1' },
      data: expect.objectContaining({
        name: '[DELETED]',
        email: 'deleted-agent-1@removed.local',
        avatarUrl: null,
        provider: null,
        providerId: null,
      }),
    });
    expect(prisma.agentComplianceState.upsert).toHaveBeenCalledWith({
      where: { agentId: 'agent-1' },
      create: expect.objectContaining({
        agentId: 'agent-1',
        purgedAt: expect.any(Date),
      }),
      update: expect.objectContaining({
        purgedAt: expect.any(Date),
      }),
    });
    expect(prisma.dataDeletionRequest.update).toHaveBeenCalledWith({
      where: { id: 'delreq-2' },
      data: expect.objectContaining({
        status: 'completed',
        completedAt: expect.any(Date),
      }),
    });
    expect(result).toEqual({
      confirmation_code: expect.stringMatching(/^[A-Za-z0-9]{14,16}$/),
      url: expect.stringMatching(/^https:\/\/kloel\.com\/data-deletion\/status\/[A-Za-z0-9]{14,16}$/),
    });
    const storedCode = prisma.dataDeletionRequest.create.mock.calls[0][0].data.confirmationCode;
    expect(storedCode).toBe(hashAuthToken(result.confirmation_code));
  });

  it('maps malformed Facebook signed_request payloads to BadRequestException', async () => {
    (validateSignedRequest as jest.Mock).mockImplementation(() => {
      throw new Error('Malformed Meta signed_request.');
    });

    await expect(service.createFacebookDeletionRequest('broken')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('removes linked facebook access without anonymizing agents whose primary login is different', async () => {
    (validateSignedRequest as jest.Mock).mockReturnValue({
      algorithm: 'HMAC-SHA256',
      user_id: 'facebook-user-123',
    });
    prisma.agent.findFirst.mockResolvedValue({
      id: 'agent-2',
      provider: 'email',
      providerId: null,
    });

    const result = await service.handleFacebookDeauthorize('signed-request-payload');

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { agentId: 'agent-2', revoked: false },
      data: { revoked: true },
    });
    expect(prisma.socialAccount.deleteMany).toHaveBeenCalledWith({
      where: {
        agentId: 'agent-2',
        provider: 'facebook',
        providerUserId: 'facebook-user-123',
      },
    });
    expect(prisma.agent.update).not.toHaveBeenCalled();
    expect(result).toEqual({
      revoked: true,
      providerUserId: 'facebook-user-123',
    });
  });

  it('records a RISC event and revokes refresh sessions for sessions-revoked', async () => {
    (validateSecurityEventToken as jest.Mock).mockResolvedValue({
      sub: 'google-user-123',
      events: {
        'https://schemas.openid.net/secevent/risc/event-type/sessions-revoked': {},
      },
    });
    prisma.riscEvent.create.mockResolvedValue({ id: 'risc-1' });
    prisma.agent.findFirst.mockResolvedValue({ id: 'agent-1' });

    await service.handleGoogleRiscEvent('google-risc-jwt');

    expect(validateSecurityEventToken).toHaveBeenCalled();
    expect(prisma.riscEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subject: 'google-user-123',
          eventType: 'https://schemas.openid.net/secevent/risc/event-type/sessions-revoked',
          rawJwt: 'google-risc-jwt',
        }),
      }),
    );
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { agentId: 'agent-1', revoked: false },
      data: { revoked: true },
    });
    expect(prisma.riscEvent.update).toHaveBeenCalledWith({
      where: { id: 'risc-1' },
      data: expect.objectContaining({
        processed: true,
        processedAt: expect.any(Date),
      }),
    });
  });

  it('revokes refresh sessions for Google social accounts linked outside the primary provider fields', async () => {
    (validateSecurityEventToken as jest.Mock).mockResolvedValue({
      sub: 'google-user-123',
      events: {
        'https://schemas.openid.net/secevent/risc/event-type/sessions-revoked': {},
      },
    });
    prisma.riscEvent.create.mockResolvedValue({ id: 'risc-1b' });
    prisma.agent.findFirst.mockImplementation(({ where }: { where?: Record<string, unknown> }) => {
      const orClauses = Array.isArray(where?.OR) ? where.OR : [];
      const linkedGoogleIdentity = orClauses.some((clause) => {
        const socialAccounts = (clause as { socialAccounts?: { some?: Record<string, unknown> } })
          ?.socialAccounts?.some;
        return (
          socialAccounts?.provider === 'google' && socialAccounts?.providerUserId === 'google-user-123'
        );
      });

      if (linkedGoogleIdentity) {
        return Promise.resolve({
          id: 'agent-linked-google',
          provider: 'email',
          providerId: null,
        });
      }

      return Promise.resolve(null);
    });

    await service.handleGoogleRiscEvent('google-risc-linked-jwt');

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { agentId: 'agent-linked-google', revoked: false },
      data: { revoked: true },
    });
  });

  it('purges the linked agent on Google account-purged without creating a self-service deletion request', async () => {
    (validateSecurityEventToken as jest.Mock).mockResolvedValue({
      sub: 'google-user-123',
      events: {
        'https://schemas.openid.net/secevent/risc/event-type/account-purged': {},
      },
    });
    prisma.riscEvent.create.mockResolvedValue({ id: 'risc-2' });
    prisma.agent.findFirst.mockResolvedValue({
      id: 'agent-9',
      email: 'purged@kloel.com',
      name: 'Purged User',
      provider: 'google',
      providerId: 'google-user-123',
    });

    await service.handleGoogleRiscEvent('google-purged-jwt');

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { agentId: 'agent-9', revoked: false },
      data: { revoked: true },
    });
    expect(prisma.socialAccount.deleteMany).toHaveBeenCalledWith({
      where: { agentId: 'agent-9' },
    });
    expect(prisma.agent.update).toHaveBeenCalledWith({
      where: { id: 'agent-9' },
      data: expect.objectContaining({
        name: '[DELETED]',
        email: 'deleted-agent-9@removed.local',
        provider: null,
        providerId: null,
      }),
    });
    expect(prisma.agentComplianceState.upsert).toHaveBeenCalledWith({
      where: { agentId: 'agent-9' },
      create: expect.objectContaining({
        agentId: 'agent-9',
        purgedAt: expect.any(Date),
      }),
      update: expect.objectContaining({
        purgedAt: expect.any(Date),
      }),
    });
    expect(prisma.dataDeletionRequest.create).not.toHaveBeenCalled();
    expect(emailService.sendDataDeletionConfirmationEmail).not.toHaveBeenCalled();
  });

  it('maps malformed Google RISC tokens to BadRequestException', async () => {
    (validateSecurityEventToken as jest.Mock).mockRejectedValue(new Error('Invalid Google RISC token.'));

    await expect(service.handleGoogleRiscEvent('invalid-token')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('exports privacy-portable agent data without leaking raw refresh tokens', async () => {
    prisma.agent.findUnique.mockResolvedValue({
      id: 'agent-1',
      email: 'user@kloel.com',
    });
    prisma.workspace.findUnique.mockResolvedValue({
      id: 'ws-1',
      name: 'Workspace',
    });
    prisma.auditLog.findMany.mockResolvedValue([{ id: 'audit-1' }]);
    prisma.message.findMany.mockResolvedValue([{ id: 'msg-1' }]);
    prisma.socialAccount.findMany.mockResolvedValue([
      { provider: 'facebook', providerUserId: 'facebook-user-123' },
    ]);
    prisma.agentComplianceState.findUnique.mockResolvedValue({
      disabledAt: null,
      purgedAt: null,
    });
    prisma.dataDeletionRequest.findMany.mockResolvedValue([
      { id: 'del-1', provider: 'self', status: 'completed' },
    ]);
    prisma.refreshToken.findMany.mockResolvedValue([
      {
        id: 'session-1',
        revoked: false,
        expiresAt: new Date('2026-05-01T00:00:00.000Z'),
        revokedAt: null,
        lastUsedAt: new Date('2026-04-18T00:00:00.000Z'),
        userAgent: 'Safari',
        ipAddress: '127.0.0.1',
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
        updatedAt: new Date('2026-04-18T00:00:00.000Z'),
      },
    ]);

    const result = await service.exportAgentData('agent-1', 'ws-1');

    expect(prisma.refreshToken.findMany).toHaveBeenCalledWith({
      where: { agentId: 'agent-1' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        revoked: true,
        expiresAt: true,
        revokedAt: true,
        lastUsedAt: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({ id: 'agent-1' }),
        workspace: expect.objectContaining({ id: 'ws-1' }),
        socialAccounts: [{ provider: 'facebook', providerUserId: 'facebook-user-123' }],
        complianceState: { disabledAt: null, purgedAt: null },
        deletionRequests: [{ id: 'del-1', provider: 'self', status: 'completed' }],
        sessions: [
          expect.objectContaining({
            id: 'session-1',
            revoked: false,
            userAgent: 'Safari',
          }),
        ],
      }),
    );
    expect(JSON.stringify(result)).not.toContain('token');
  });

  it('looks up deletion status by hashed confirmation code and still supports legacy plaintext rows', async () => {
    prisma.dataDeletionRequest.findUnique.mockImplementation(
      async ({ where }: { where: { confirmationCode: string } }) => {
        if (where.confirmationCode === hashAuthToken('CONFIRM123456789')) {
          return {
            provider: 'self',
            status: 'completed',
            requestedAt: new Date('2026-04-18T00:00:00.000Z'),
            completedAt: new Date('2026-04-18T01:00:00.000Z'),
          };
        }

        if (where.confirmationCode === 'LEGACYCONFIRM123') {
          return {
            provider: 'facebook',
            status: 'completed',
            requestedAt: new Date('2026-04-18T00:00:00.000Z'),
            completedAt: null,
          };
        }

        return null;
      },
    );

    await expect(service.getDeletionStatus('CONFIRM123456789')).resolves.toEqual({
      provider: 'self',
      status: 'completed',
      requestedAt: new Date('2026-04-18T00:00:00.000Z'),
      completedAt: new Date('2026-04-18T01:00:00.000Z'),
    });

    expect(prisma.dataDeletionRequest.findUnique).toHaveBeenNthCalledWith(1, {
      where: { confirmationCode: hashAuthToken('CONFIRM123456789') },
      select: {
        provider: true,
        status: true,
        requestedAt: true,
        completedAt: true,
      },
    });

    await expect(service.getDeletionStatus('LEGACYCONFIRM123')).resolves.toEqual({
      provider: 'facebook',
      status: 'completed',
      requestedAt: new Date('2026-04-18T00:00:00.000Z'),
      completedAt: null,
    });

    expect(prisma.dataDeletionRequest.findUnique).toHaveBeenNthCalledWith(2, {
      where: { confirmationCode: hashAuthToken('LEGACYCONFIRM123') },
      select: {
        provider: true,
        status: true,
        requestedAt: true,
        completedAt: true,
      },
    });
    expect(prisma.dataDeletionRequest.findUnique).toHaveBeenNthCalledWith(3, {
      where: { confirmationCode: 'LEGACYCONFIRM123' },
      select: {
        provider: true,
        status: true,
        requestedAt: true,
        completedAt: true,
      },
    });
  });

  it('sends a confirmation email when self-service deletion is requested', async () => {
    prisma.agent.findUnique.mockResolvedValue({
      id: 'agent-1',
      email: 'user@kloel.com',
      name: 'User Name',
    });

    const result = await service.requestSelfDeletion('agent-1', 'ws-1');

    expect(prisma.agent.findUnique).toHaveBeenCalledWith({
      where: { id: 'agent-1' },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });
    expect(emailService.sendDataDeletionConfirmationEmail).toHaveBeenCalledWith(
      'user@kloel.com',
      expect.any(String),
      expect.stringContaining('/data-deletion/status/'),
      'User Name',
    );
    const storedCode = prisma.dataDeletionRequest.create.mock.calls[0][0].data.confirmationCode;
    expect(storedCode).toBe(hashAuthToken(result.confirmationCode));
    expect(result).toEqual(
      expect.objectContaining({
        confirmationCode: expect.stringMatching(/^[A-Za-z0-9]{14,16}$/),
        status: 'completed',
      }),
    );
  });
});
