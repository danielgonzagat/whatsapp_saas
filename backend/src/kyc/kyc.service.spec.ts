import { KycService } from './kyc.service';

type Scenario = 'PF' | 'PJ';

function buildService(options?: { scenario?: Scenario; existingStripeAccountId?: string | null }) {
  const scenario = options?.scenario ?? 'PF';
  const existingStripeAccountId = options?.existingStripeAccountId ?? null;
  const agentRecord = {
    id: 'agent_1',
    email: 'seller@example.com',
    name: scenario === 'PJ' ? 'Bruna Souza' : 'Ana Silva',
    phone: '+55 11 99999-0000',
    birthDate: new Date('1991-05-07T00:00:00.000Z'),
    documentNumber: scenario === 'PJ' ? '111.222.333-44' : '123.456.789-09',
    publicName: 'Acme Cursos',
    website: 'https://acme.test',
    kycStatus: 'pending',
  };
  const workspaceRecord = {
    id: 'ws_1',
    name: 'Workspace Acme',
  };
  const fiscalRecord =
    scenario === 'PJ'
      ? {
          workspaceId: 'ws_1',
          type: 'PJ',
          cpf: null,
          fullName: null,
          cnpj: '12.345.678/0001-90',
          razaoSocial: 'Acme Cursos Ltda',
          nomeFantasia: 'Acme Cursos',
          responsavelCpf: '111.222.333-44',
          responsavelNome: 'Bruna Souza',
          cep: '01001-000',
          street: 'Rua das Flores',
          number: '100',
          complement: 'Sala 8',
          neighborhood: 'Centro',
          city: 'Sao Paulo',
          state: 'SP',
        }
      : {
          workspaceId: 'ws_1',
          type: 'PF',
          cpf: '123.456.789-09',
          fullName: 'Ana Silva',
          cnpj: null,
          razaoSocial: null,
          nomeFantasia: null,
          responsavelCpf: null,
          responsavelNome: null,
          cep: '01001-000',
          street: 'Rua das Flores',
          number: '100',
          complement: 'Apto 12',
          neighborhood: 'Centro',
          city: 'Sao Paulo',
          state: 'SP',
        };
  const bankAccountRecord = {
    workspaceId: 'ws_1',
    bankName: 'Itau',
    bankCode: '341',
    agency: '1234',
    account: '12345-6',
    accountType: 'CHECKING',
    pixKey: null,
    pixKeyType: null,
    holderName: scenario === 'PJ' ? 'Acme Cursos Ltda' : 'Ana Silva',
    holderDocument: scenario === 'PJ' ? '12.345.678/0001-90' : '123.456.789-09',
    isDefault: true,
    createdAt: new Date('2026-04-22T00:00:00.000Z'),
  };
  const kycDocuments =
    scenario === 'PJ'
      ? [{ type: 'DOCUMENT_FRONT' }, { type: 'COMPANY_DOCUMENT' }]
      : [{ type: 'DOCUMENT_FRONT' }, { type: 'PROOF_OF_ADDRESS' }];

  const prisma = {
    agent: {
      findUnique: jest.fn(async ({ select }: { select?: Record<string, boolean> }) => {
        if (select && 'kycStatus' in select && Object.keys(select).length === 1) {
          return { kycStatus: agentRecord.kycStatus };
        }

        if (select && 'email' in select) {
          return agentRecord;
        }

        if (select && 'name' in select && 'phone' in select && 'birthDate' in select) {
          return {
            name: agentRecord.name,
            phone: agentRecord.phone,
            birthDate: agentRecord.birthDate,
          };
        }

        return agentRecord;
      }),
      update: jest.fn().mockResolvedValue(undefined),
    },
    workspace: {
      findUnique: jest.fn().mockResolvedValue(workspaceRecord),
    },
    fiscalData: {
      findUnique: jest.fn().mockResolvedValue(fiscalRecord),
    },
    kycDocument: {
      findMany: jest.fn().mockResolvedValue(kycDocuments),
    },
    bankAccount: {
      findFirst: jest.fn().mockResolvedValue(bankAccountRecord),
    },
    connectAccountBalance: {
      findFirst: jest.fn().mockResolvedValue(
        existingStripeAccountId
          ? {
              id: 'cab_existing',
              stripeAccountId: existingStripeAccountId,
            }
          : null,
      ),
    },
  };
  const storage = {
    upload: jest.fn(),
  };
  const auditService = {
    log: jest.fn(),
  };
  const connectService = {
    createCustomAccount: jest.fn().mockResolvedValue({
      accountBalanceId: 'cab_new',
      stripeAccountId: 'acct_seller_1',
      requestedCapabilities: ['card_payments', 'transfers'],
    }),
    submitOnboardingProfile: jest.fn().mockResolvedValue({
      stripeAccountId: existingStripeAccountId ?? 'acct_seller_1',
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: true,
      requirementsCurrentlyDue: [],
      requirementsPastDue: [],
      requirementsDisabledReason: null,
      capabilities: {
        card_payments: 'pending',
        transfers: 'pending',
      },
    }),
  };

  return {
    prisma,
    storage,
    auditService,
    connectService,
    service: new KycService(
      prisma as never,
      storage as never,
      auditService as never,
      connectService as never,
    ),
  };
}

describe('KycService.submitKyc', () => {
  it('creates a seller connect account and submits PF onboarding from KYC data', async () => {
    const { service, prisma, connectService } = buildService();

    const result = await service.submitKyc('agent_1', 'ws_1', {
      ipAddress: '203.0.113.10',
      userAgent: 'Mozilla/5.0',
    });

    expect(connectService.createCustomAccount).toHaveBeenCalledWith({
      workspaceId: 'ws_1',
      accountType: 'SELLER',
      email: 'seller@example.com',
      displayName: 'Ana Silva',
    });
    expect(connectService.submitOnboardingProfile).toHaveBeenCalledWith({
      stripeAccountId: 'acct_seller_1',
      email: 'seller@example.com',
      country: 'BR',
      businessType: 'individual',
      businessProfile: {
        name: 'Ana Silva',
        url: 'https://acme.test',
        supportEmail: 'seller@example.com',
        supportPhone: '+55 11 99999-0000',
      },
      individual: {
        firstName: 'Ana',
        lastName: 'Silva',
        email: 'seller@example.com',
        phone: '+55 11 99999-0000',
        dateOfBirth: {
          day: 7,
          month: 5,
          year: 1991,
        },
        idNumber: '123.456.789-09',
        address: {
          line1: 'Rua das Flores, 100',
          line2: 'Apto 12 - Centro',
          city: 'Sao Paulo',
          state: 'SP',
          postalCode: '01001-000',
          country: 'BR',
        },
      },
      company: undefined,
      externalAccount: {
        country: 'BR',
        currency: 'BRL',
        accountHolderName: 'Ana Silva',
        accountHolderType: 'individual',
        routingNumber: '3411234',
        accountNumber: '123456',
      },
      tosAcceptance: expect.objectContaining({
        acceptedAt: expect.any(String),
        ipAddress: '203.0.113.10',
        userAgent: 'Mozilla/5.0',
      }),
      metadata: {
        kycWorkspaceId: 'ws_1',
        kycAgentId: 'agent_1',
        kycSource: 'kyc_submit',
      },
    });
    expect(prisma.agent.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'agent_1' },
      data: { kycStatus: 'submitted', kycSubmittedAt: expect.any(Date) },
    });
    expect(prisma.agent.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'agent_1' },
      data: { kycStatus: 'approved', kycApprovedAt: expect.any(Date) },
    });
    expect(result).toEqual({
      success: true,
      status: 'approved',
      autoApproved: true,
      percentage: 100,
    });
  });

  it('reuses an existing seller connect account and submits PJ onboarding with representative data', async () => {
    const { service, connectService } = buildService({
      scenario: 'PJ',
      existingStripeAccountId: 'acct_existing_seller',
    });

    await service.submitKyc('agent_1', 'ws_1', {
      ipAddress: '203.0.113.11',
      userAgent: 'Mozilla/5.0 (PJ)',
    });

    expect(connectService.createCustomAccount).not.toHaveBeenCalled();
    expect(connectService.submitOnboardingProfile).toHaveBeenCalledWith({
      stripeAccountId: 'acct_existing_seller',
      email: 'seller@example.com',
      country: 'BR',
      businessType: 'company',
      businessProfile: {
        name: 'Acme Cursos',
        url: 'https://acme.test',
        supportEmail: 'seller@example.com',
        supportPhone: '+55 11 99999-0000',
      },
      individual: {
        firstName: 'Bruna',
        lastName: 'Souza',
        email: 'seller@example.com',
        phone: '+55 11 99999-0000',
        dateOfBirth: {
          day: 7,
          month: 5,
          year: 1991,
        },
        idNumber: '111.222.333-44',
        address: {
          line1: 'Rua das Flores, 100',
          line2: 'Sala 8 - Centro',
          city: 'Sao Paulo',
          state: 'SP',
          postalCode: '01001-000',
          country: 'BR',
        },
      },
      company: {
        name: 'Acme Cursos Ltda',
        taxId: '12.345.678/0001-90',
        phone: '+55 11 99999-0000',
        address: {
          line1: 'Rua das Flores, 100',
          line2: 'Sala 8 - Centro',
          city: 'Sao Paulo',
          state: 'SP',
          postalCode: '01001-000',
          country: 'BR',
        },
      },
      externalAccount: {
        country: 'BR',
        currency: 'BRL',
        accountHolderName: 'Acme Cursos Ltda',
        accountHolderType: 'company',
        routingNumber: '3411234',
        accountNumber: '123456',
      },
      tosAcceptance: expect.objectContaining({
        acceptedAt: expect.any(String),
        ipAddress: '203.0.113.11',
        userAgent: 'Mozilla/5.0 (PJ)',
      }),
      metadata: {
        kycWorkspaceId: 'ws_1',
        kycAgentId: 'agent_1',
        kycSource: 'kyc_submit',
      },
    });
  });

  it('rejects submission when KYC completion < 100%', async () => {
    const { service, prisma } = buildService();
    prisma.kycDocument.findMany.mockResolvedValue([{ type: 'DOCUMENT_FRONT' }]);

    await expect(service.submitKyc('agent_1', 'ws_1')).rejects.toThrow(
      'Complete all required sections before submitting',
    );
  });

  it('rejects re-submission when status is already submitted', async () => {
    const { service, prisma } = buildService();
    const agentRecord = {
      kycStatus: 'submitted',
    };
    prisma.agent.findUnique.mockResolvedValue(agentRecord);

    await expect(service.submitKyc('agent_1', 'ws_1')).rejects.toThrow(
      'KYC already submitted and under review',
    );
  });

  it('rejects re-submission when status is already approved', async () => {
    const { service, prisma } = buildService();
    prisma.agent.findUnique.mockResolvedValue({ kycStatus: 'approved' });

    await expect(service.submitKyc('agent_1', 'ws_1')).rejects.toThrow('KYC already approved');
  });

  it('resets status to pending when updating a rejected profile', async () => {
    const { service, prisma } = buildService();
    prisma.agent.findUnique.mockResolvedValue({
      kycStatus: 'rejected',
    });

    await service.updateProfile('agent_1', {
      name: 'Updated Name',
    });

    expect(prisma.agent.update).toHaveBeenCalledWith({
      where: { id: 'agent_1' },
      data: expect.objectContaining({
        name: 'Updated Name',
        kycStatus: 'pending',
        kycRejectedReason: null,
      }),
    });
  });

  it('adminApprove transitions status to approved', async () => {
    const { service, prisma } = buildService();
    prisma.agent.findUnique.mockResolvedValue({
      id: 'agent_1',
      kycStatus: 'submitted',
    });

    const result = await service.adminApprove('agent_1');

    expect(prisma.agent.update).toHaveBeenCalledWith({
      where: { id: 'agent_1' },
      data: expect.objectContaining({
        kycStatus: 'approved',
        kycApprovedAt: expect.anything(),
      }),
    });
    const adminUpdateCall = prisma.agent.update.mock.calls.at(-1)?.[0];
    expect(adminUpdateCall?.data.kycApprovedAt).toBeInstanceOf(Date);
    expect(result).toEqual({
      success: true,
      status: 'approved',
      agentId: 'agent_1',
    });
  });

  it('adminApprove rejects if already approved', async () => {
    const { service, prisma } = buildService();
    prisma.agent.findUnique.mockResolvedValue({
      id: 'agent_1',
      kycStatus: 'approved',
    });

    await expect(service.adminApprove('agent_1')).rejects.toThrow('KYC already approved');
  });

  it('adminApprove rejects if agent not found', async () => {
    const { service, prisma } = buildService();
    prisma.agent.findUnique.mockResolvedValue(null);

    await expect(service.adminApprove('agent_nonexistent')).rejects.toThrow('Agent not found');
  });

  it('uploadDocument validates file size limit', async () => {
    const { service } = buildService();

    await expect(
      service.uploadDocument('agent_1', 'ws_1', 'DOCUMENT_FRONT', {
        buffer: Buffer.alloc(11 * 1024 * 1024),
        originalname: 'oversized.pdf',
        mimetype: 'application/pdf',
        size: 11 * 1024 * 1024,
      }),
    ).rejects.toThrow('File too large (max 10MB)');
  });

  it('uploadDocument rejects invalid document type', async () => {
    const { service } = buildService();

    await expect(
      service.uploadDocument('agent_1', 'ws_1', 'INVALID_TYPE', {
        buffer: Buffer.alloc(100),
        originalname: 'doc.pdf',
        mimetype: 'application/pdf',
        size: 100,
      }),
    ).rejects.toThrow('Invalid document type');
  });

  it('uploadDocument rejects unsupported MIME type', async () => {
    const { service } = buildService();

    await expect(
      service.uploadDocument('agent_1', 'ws_1', 'DOCUMENT_FRONT', {
        buffer: Buffer.alloc(100),
        originalname: 'doc.exe',
        mimetype: 'application/x-msdownload',
        size: 100,
      }),
    ).rejects.toThrow('Only JPG, PNG, WebP, and PDF files are allowed');
  });

  it('deleteDocument logs audit trail', async () => {
    const { service, prisma, auditService } = buildService();
    const mockDoc = {
      id: 'doc_1',
      workspaceId: 'ws_1',
      agentId: 'agent_1',
      type: 'DOCUMENT_FRONT',
      status: 'pending',
    };
    prisma.kycDocument.findUnique.mockResolvedValue(mockDoc);

    await service.deleteDocument('agent_1', 'doc_1');

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws_1',
        action: 'DELETE_RECORD',
        resource: 'KycDocument',
        resourceId: 'doc_1',
        agentId: 'agent_1',
        details: expect.objectContaining({
          deletedBy: 'user',
          type: 'DOCUMENT_FRONT',
        }),
      }),
    );
  });

  it('deleteDocument rejects if not pending', async () => {
    const { service, prisma } = buildService();
    prisma.kycDocument.findUnique.mockResolvedValue({
      id: 'doc_1',
      workspaceId: 'ws_1',
      agentId: 'agent_1',
      type: 'DOCUMENT_FRONT',
      status: 'approved',
    });

    await expect(service.deleteDocument('agent_1', 'doc_1')).rejects.toThrow(
      'Cannot delete a document that is already under review or approved',
    );
  });

  it('deleteDocument rejects if wrong agent', async () => {
    const { service, prisma } = buildService();
    prisma.kycDocument.findUnique.mockResolvedValue({
      id: 'doc_1',
      workspaceId: 'ws_1',
      agentId: 'other_agent',
      type: 'DOCUMENT_FRONT',
      status: 'pending',
    });

    await expect(service.deleteDocument('agent_1', 'doc_1')).rejects.toThrow('Not your document');
  });

  it('autoApproveIfComplete approves when completion >= 75%', async () => {
    const { service, prisma } = buildService();

    const result = await service.autoApproveIfComplete('agent_1', 'ws_1');

    expect(result.approved).toBe(true);
    expect(result.percentage).toBe(100);
    expect(prisma.agent.update).toHaveBeenCalledWith({
      where: { id: 'agent_1' },
      data: expect.objectContaining({
        kycStatus: 'approved',
        kycApprovedAt: expect.anything(),
      }),
    });
    const autoApproveCall = prisma.agent.update.mock.calls.at(-1)?.[0];
    expect(autoApproveCall?.data.kycApprovedAt).toBeInstanceOf(Date);
  });

  it('changePassword validates current password', async () => {
    const { service, prisma } = buildService();
    prisma.agent.findUnique.mockResolvedValue({
      password: '$2a$10$invalid_hash',
      provider: null,
    });

    await expect(
      service.changePassword('agent_1', {
        currentPassword: 'wrong',
        newPassword: 'newpass123',
      }),
    ).rejects.toThrow('Current password is incorrect');
  });

  it('changePassword rejects OAuth users without password', async () => {
    const { service, prisma } = buildService();
    prisma.agent.findUnique.mockResolvedValue({
      password: null,
      provider: 'google',
    });

    await expect(
      service.changePassword('agent_1', {
        currentPassword: '',
        newPassword: 'newpass123',
      }),
    ).rejects.toThrow('OAuth users cannot change password here');
  });

  it('getCompletion calculates PF section completion correctly', async () => {
    const { service } = buildService();

    const result = await service.getCompletion('agent_1', 'ws_1');

    expect(result.percentage).toBe(100);
    expect(result.canSubmit).toBe(true);
    expect(result.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'profile', complete: true }),
        expect.objectContaining({ name: 'fiscal', complete: true }),
        expect.objectContaining({ name: 'documents', complete: true }),
        expect.objectContaining({ name: 'bank', complete: true }),
      ]),
    );
  });

  it('getCompletion requires COMPANY_DOCUMENT for PJ', async () => {
    const { service, prisma } = buildService({ scenario: 'PJ' });
    prisma.kycDocument.findMany.mockResolvedValue([
      { type: 'DOCUMENT_FRONT' },
      { type: 'PROOF_OF_ADDRESS' },
    ]);

    const result = await service.getCompletion('agent_1', 'ws_1');

    expect(result.sections.find((s) => s.name === 'documents')?.complete).toBe(false);
  });
});
