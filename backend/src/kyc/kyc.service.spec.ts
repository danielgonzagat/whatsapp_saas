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
});
