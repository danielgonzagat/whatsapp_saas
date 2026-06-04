import { jest } from '@jest/globals';
import { KycService } from './kyc.service';

type Scenario = 'PF' | 'PJ';

export interface ConnectOnboardingStatusOverride {
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  requirementsCurrentlyDue?: string[];
}

export function buildService(options?: {
  scenario?: Scenario;
  existingStripeAccountId?: string | null;
  /** Overrides the Stripe Connect onboarding status reported by the test ConnectService double. */
  connectStatus?: ConnectOnboardingStatusOverride;
}) {
  const scenario = options?.scenario ?? 'PF';
  const existingStripeAccountId = options?.existingStripeAccountId ?? null;
  const connectStatus = options?.connectStatus ?? {};
  const agentRecord: {
    id: string;
    email: string;
    name: string;
    phone: string;
    birthDate: Date;
    documentNumber: string;
    publicName: string;
    website: string;
    kycStatus: string;
    password: string | null;
    provider: string | null;
    mfaSecret: string | null;
    mfaEnabled: boolean;
    mfaPendingSetup: boolean;
  } = {
    id: 'agent_1',
    email: 'seller@example.com',
    name: scenario === 'PJ' ? 'Bruna Souza' : 'Ana Silva',
    phone: '+55 11 99999-0000',
    birthDate: new Date('1991-05-07T00:00:00.000Z'),
    documentNumber: scenario === 'PJ' ? '111.222.333-44' : '123.456.789-09',
    publicName: 'Acme Cursos',
    website: 'https://acme.test',
    kycStatus: 'pending',
    password: null,
    provider: null,
    mfaSecret: null,
    mfaEnabled: false,
    mfaPendingSetup: false,
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

  const agentFindUnique = jest.fn<
    ({ select }?: { select?: Record<string, boolean> }) => Promise<unknown>
  >(({ select }: { select?: Record<string, boolean> } = {}) => {
    if (select && 'kycStatus' in select && Object.keys(select).length === 1) {
      return Promise.resolve({ kycStatus: agentRecord.kycStatus });
    }

    if (select && 'email' in select) {
      return Promise.resolve(agentRecord);
    }

    if (select && 'name' in select && 'phone' in select && 'birthDate' in select) {
      return Promise.resolve({
        name: agentRecord.name,
        phone: agentRecord.phone,
        birthDate: agentRecord.birthDate,
      });
    }

    return Promise.resolve(agentRecord);
  });
  const resolved = <T>(value: T) =>
    jest.fn<(...args: unknown[]) => Promise<T>>().mockResolvedValue(value);
  const prisma = {
    agent: {
      findUnique: agentFindUnique,
      findFirst: agentFindUnique,
      update: resolved(undefined),
    },
    workspace: {
      findUnique: resolved(workspaceRecord),
    },
    fiscalData: {
      findUnique: resolved(fiscalRecord),
    },
    kycDocument: {
      findMany: resolved(kycDocuments),
      findUnique: resolved(null),
      delete: resolved(undefined),
    },
    bankAccount: {
      findFirst: resolved(bankAccountRecord),
    },
    refreshToken: {
      findMany: resolved([]),
      updateMany: resolved({ count: 1 }),
    },
    connectAccountBalance: {
      findFirst: resolved(
        existingStripeAccountId
          ? {
              id: 'cab_existing',
              accountType: 'SELLER',
              stripeAccountId: existingStripeAccountId,
            }
          : null,
      ),
    },
  };
  Object.assign(prisma, {
    $transaction: jest.fn((callback: (tx: typeof prisma) => unknown) => callback(prisma)),
  });
  const storage = {
    upload: jest.fn(),
  };
  const auditService = {
    log: jest.fn(),
  };
  const onboardingStatus = {
    stripeAccountId: existingStripeAccountId ?? 'acct_seller_1',
    chargesEnabled: connectStatus.chargesEnabled ?? false,
    payoutsEnabled: connectStatus.payoutsEnabled ?? false,
    detailsSubmitted: true,
    requirementsCurrentlyDue: connectStatus.requirementsCurrentlyDue ?? [],
    requirementsPastDue: [],
    requirementsDisabledReason: null,
    capabilities: {
      card_payments: 'pending',
      transfers: 'pending',
    },
  };
  const connectService = {
    createCustomAccount: resolved({
      accountBalanceId: 'cab_new',
      stripeAccountId: 'acct_seller_1',
      requestedCapabilities: ['card_payments', 'transfers'],
    }),
    submitOnboardingProfile: resolved(onboardingStatus),
    getOnboardingStatus: resolved(onboardingStatus),
  };

  const kycEventEmitter = {
    emitDocumentSubmitted: jest.fn(),
    emitApproved: jest.fn(),
    emitRejected: jest.fn(),
  };
  const accountMfaService = {
    createSetup: resolved({
      encryptedSecret: 'encrypted-secret',
      qrDataUrl: 'data:image/png;base64,qr',
      otpauthUrl: 'otpauth://totp/Kloel:seller@example.com?secret=ABC',
    }),
    resumeSetup: resolved({
      encryptedSecret: 'encrypted-secret',
      qrDataUrl: 'data:image/png;base64,qr',
      otpauthUrl: 'otpauth://totp/Kloel:seller@example.com?secret=ABC',
    }),
    verifyCode: jest.fn(),
  };

  return {
    prisma,
    storage,
    auditService,
    connectService,
    kycEventEmitter,
    accountMfaService,
    service: new KycService(
      prisma as never,
      storage as never,
      auditService as never,
      connectService as never,
      kycEventEmitter as never,
      accountMfaService as never,
    ),
  };
}
