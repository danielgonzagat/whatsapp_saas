import { BadRequestException, NotFoundException } from '@nestjs/common';
import { castMock } from '../../test/helpers/cast-mock';
import { partialMatch } from '../../test/helpers/match-instance';
import {
  doAdminApprove,
  doApproveIfConnectEnabled,
  isConnectKycApproved,
  syncSellerConnectOnboarding,
  type SyncOnboardingDeps,
} from './kyc.connect-onboarding';
import { buildConnectAddress } from './kyc.helpers';
import type { OnboardingStatus } from '../payments/connect/connect.types';

const ENABLED_STATUS = castMock<OnboardingStatus>({
  chargesEnabled: true,
  payoutsEnabled: true,
  requirementsCurrentlyDue: [],
});

interface TxShape {
  agent: { findFirst: jest.Mock; update: jest.Mock };
}

function buildTx(): TxShape {
  return { agent: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}) } };
}

describe('isConnectKycApproved', () => {
  it('rejects a missing status', () => {
    expect(isConnectKycApproved(null)).toBe(false);
  });

  it('requires charges AND payouts to be enabled', () => {
    expect(isConnectKycApproved({ ...ENABLED_STATUS, chargesEnabled: false })).toBe(false);
    expect(isConnectKycApproved({ ...ENABLED_STATUS, payoutsEnabled: false })).toBe(false);
  });

  it('rejects accounts with outstanding verification requirements', () => {
    expect(
      isConnectKycApproved({ ...ENABLED_STATUS, requirementsCurrentlyDue: ['individual.dob'] }),
    ).toBe(false);
  });

  it('approves a fully enabled account (missing requirements list counts as empty)', () => {
    expect(isConnectKycApproved(ENABLED_STATUS)).toBe(true);
    expect(
      isConnectKycApproved(
        castMock<OnboardingStatus>({ ...ENABLED_STATUS, requirementsCurrentlyDue: undefined }),
      ),
    ).toBe(true);
  });
});

describe('doAdminApprove', () => {
  let tx: TxShape;
  let deps: Parameters<typeof doAdminApprove>[0];

  beforeEach(() => {
    tx = buildTx();
    deps = {
      prisma: castMock<Parameters<typeof doAdminApprove>[0]['prisma']>({
        $transaction: jest.fn((fn: (t: TxShape) => unknown) => fn(tx)),
      }),
    };
  });

  it('404s when the agent does not exist', async () => {
    tx.agent.findFirst.mockResolvedValue(null);
    await expect(doAdminApprove(deps, 'a-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.agent.update).not.toHaveBeenCalled();
  });

  it('rejects double-approval', async () => {
    tx.agent.findFirst.mockResolvedValue({ id: 'a-1', workspaceId: 'ws-1', kycStatus: 'approved' });
    await expect(doAdminApprove(deps, 'a-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.agent.update).not.toHaveBeenCalled();
  });

  it('stamps kycStatus=approved scoped to the agent workspace', async () => {
    tx.agent.findFirst.mockResolvedValue({
      id: 'a-1',
      workspaceId: 'ws-1',
      kycStatus: 'submitted',
    });

    const result = await doAdminApprove(deps, 'a-1');

    expect(result).toEqual({ success: true, status: 'approved', agentId: 'a-1' });
    expect(tx.agent.update).toHaveBeenCalledWith(
      partialMatch({
        where: { id: 'a-1', workspaceId: 'ws-1' },
        data: partialMatch({ kycStatus: 'approved' }),
      }),
    );
  });
});

describe('doApproveIfConnectEnabled', () => {
  let prisma: { connectAccountBalance: { findFirst: jest.Mock }; agent: { update: jest.Mock } };
  let connectService: { getOnboardingStatus: jest.Mock };
  let deps: Parameters<typeof doApproveIfConnectEnabled>[0];

  beforeEach(() => {
    prisma = {
      connectAccountBalance: { findFirst: jest.fn() },
      agent: { update: jest.fn().mockResolvedValue({}) },
    };
    connectService = { getOnboardingStatus: jest.fn() };
    deps = castMock<Parameters<typeof doApproveIfConnectEnabled>[0]>({
      prisma,
      connectService,
    });
  });

  it('never approves when the seller has no Connect account yet', async () => {
    prisma.connectAccountBalance.findFirst.mockResolvedValue(null);

    await expect(doApproveIfConnectEnabled(deps, 'a-1', 'ws-1')).resolves.toEqual({
      approved: false,
      connectEnabled: false,
    });
    expect(connectService.getOnboardingStatus).not.toHaveBeenCalled();
    expect(prisma.agent.update).not.toHaveBeenCalled();
  });

  it('never rubber-stamps approval while Stripe still reports requirements due', async () => {
    prisma.connectAccountBalance.findFirst.mockResolvedValue({ stripeAccountId: 'acct_1' });
    connectService.getOnboardingStatus.mockResolvedValue({
      ...ENABLED_STATUS,
      requirementsCurrentlyDue: ['individual.verification.document'],
    });

    await expect(doApproveIfConnectEnabled(deps, 'a-1', 'ws-1')).resolves.toEqual({
      approved: false,
      connectEnabled: false,
    });
    expect(prisma.agent.update).not.toHaveBeenCalled();
  });

  it('approves only when the live Connect account is fully enabled', async () => {
    prisma.connectAccountBalance.findFirst.mockResolvedValue({ stripeAccountId: 'acct_1' });
    connectService.getOnboardingStatus.mockResolvedValue(ENABLED_STATUS);

    await expect(doApproveIfConnectEnabled(deps, 'a-1', 'ws-1')).resolves.toEqual({
      approved: true,
      connectEnabled: true,
    });
    expect(connectService.getOnboardingStatus).toHaveBeenCalledWith('acct_1');
    expect(prisma.agent.update).toHaveBeenCalledWith(
      partialMatch({
        where: { id: 'a-1', workspaceId: 'ws-1' },
        data: partialMatch({ kycStatus: 'approved' }),
      }),
    );
  });
});

describe('syncSellerConnectOnboarding', () => {
  interface SyncPrismaShape {
    agent: { findUnique: jest.Mock };
    workspace: { findUnique: jest.Mock };
    fiscalData: { findUnique: jest.Mock };
    bankAccount: { findFirst: jest.Mock };
    connectAccountBalance: { findFirst: jest.Mock };
  }

  let prisma: SyncPrismaShape;
  let connectService: {
    createCustomAccount: jest.Mock;
    submitOnboardingProfile: jest.Mock;
  };
  let deps: SyncOnboardingDeps;

  function submittedProfile(): Record<string, unknown> {
    const calls = castMock<Array<[Record<string, unknown>] | undefined>>(
      connectService.submitOnboardingProfile.mock.calls,
    );
    return castMock<Record<string, unknown>>(calls[0]?.[0]);
  }

  const AGENT = {
    id: 'a-1',
    email: 'maria@test.com',
    name: 'Maria da Silva',
    phone: '+55 11 91234-5678',
    birthDate: new Date(Date.UTC(1990, 4, 4)),
    documentNumber: null,
    publicName: null,
    website: null,
  };
  const WORKSPACE = { id: 'ws-1', name: 'Loja da Maria' };
  const FISCAL_PF = {
    type: 'PF',
    fullName: 'Maria da Silva',
    cpf: '123.456.789-09',
    cnpj: null,
    razaoSocial: null,
    nomeFantasia: null,
    responsavelNome: null,
    responsavelCpf: null,
    street: 'Rua A',
    number: '10',
    complement: null,
    neighborhood: 'Centro',
    city: 'São Paulo',
    state: 'SP',
    cep: '01000-000',
  };
  const BANK = {
    bankCode: '001',
    agency: '1234',
    account: '56789-0',
    holderName: 'Maria da Silva',
  };

  beforeEach(() => {
    prisma = {
      agent: { findUnique: jest.fn().mockResolvedValue(AGENT) },
      workspace: { findUnique: jest.fn().mockResolvedValue(WORKSPACE) },
      fiscalData: { findUnique: jest.fn().mockResolvedValue(FISCAL_PF) },
      bankAccount: { findFirst: jest.fn().mockResolvedValue(BANK) },
      connectAccountBalance: {
        findFirst: jest.fn().mockResolvedValue({ stripeAccountId: 'acct_existing' }),
      },
    };
    connectService = {
      createCustomAccount: jest.fn().mockResolvedValue({ stripeAccountId: 'acct_created' }),
      submitOnboardingProfile: jest.fn().mockResolvedValue(ENABLED_STATUS),
    };
    deps = castMock<SyncOnboardingDeps>({
      prisma,
      connectService,
      buildConnectAddress,
    });
  });

  it('404s when the responsible agent is missing or has no email', async () => {
    prisma.agent.findUnique.mockResolvedValue(null);
    await expect(syncSellerConnectOnboarding(deps, 'a-1', 'ws-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    prisma.agent.findUnique.mockResolvedValue({ ...AGENT, email: null });
    await expect(syncSellerConnectOnboarding(deps, 'a-1', 'ws-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(connectService.submitOnboardingProfile).not.toHaveBeenCalled();
  });

  it('404s when the workspace is missing', async () => {
    prisma.workspace.findUnique.mockResolvedValue(null);
    await expect(syncSellerConnectOnboarding(deps, 'a-1', 'ws-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('400s when fiscal data or bank account are not on file yet', async () => {
    prisma.fiscalData.findUnique.mockResolvedValue(null);
    await expect(syncSellerConnectOnboarding(deps, 'a-1', 'ws-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    prisma.fiscalData.findUnique.mockResolvedValue(FISCAL_PF);
    prisma.bankAccount.findFirst.mockResolvedValue(null);
    await expect(syncSellerConnectOnboarding(deps, 'a-1', 'ws-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(connectService.submitOnboardingProfile).not.toHaveBeenCalled();
  });

  it('submits an individual (PF) profile reusing the existing Connect account', async () => {
    const result = await syncSellerConnectOnboarding(deps, 'a-1', 'ws-1', {
      ipAddress: '203.0.113.7',
      userAgent: 'jest-agent',
    });

    expect(result).toBe(ENABLED_STATUS);
    expect(connectService.createCustomAccount).not.toHaveBeenCalled();

    expect(connectService.submitOnboardingProfile).toHaveBeenCalledWith(
      partialMatch({
        stripeAccountId: 'acct_existing',
        email: 'maria@test.com',
        country: 'BR',
        businessType: 'individual',
        businessProfile: partialMatch({ name: 'Maria da Silva', supportEmail: 'maria@test.com' }),
        individual: partialMatch({
          firstName: 'Maria',
          lastName: 'da Silva',
          idNumber: '123.456.789-09',
          dateOfBirth: { day: 4, month: 5, year: 1990 },
          address: partialMatch({
            line1: 'Rua A, 10',
            city: 'São Paulo',
            state: 'SP',
            postalCode: '01000-000',
            country: 'BR',
          }),
        }),
        // routingNumber = bankCode + agency digits; accountNumber digits-only.
        externalAccount: partialMatch({
          currency: 'BRL',
          routingNumber: '0011234',
          accountNumber: '567890',
          accountHolderType: 'individual',
        }),
        tosAcceptance: partialMatch({ ipAddress: '203.0.113.7', userAgent: 'jest-agent' }),
        metadata: { kycWorkspaceId: 'ws-1', kycAgentId: 'a-1', kycSource: 'kyc_submit' },
      }),
    );
    expect(submittedProfile()).not.toHaveProperty('company');
  });

  it('submits a company (PJ) profile and creates the Connect account when none exists', async () => {
    prisma.connectAccountBalance.findFirst.mockResolvedValue(null);
    prisma.fiscalData.findUnique.mockResolvedValue({
      ...FISCAL_PF,
      type: 'PJ',
      razaoSocial: 'ACME Comercio LTDA',
      nomeFantasia: 'ACME',
      cnpj: '12.345.678/0001-90',
      responsavelNome: 'João Souza',
      responsavelCpf: '987.654.321-00',
    });

    await syncSellerConnectOnboarding(deps, 'a-1', 'ws-1');

    expect(connectService.createCustomAccount).toHaveBeenCalledWith(
      partialMatch({
        workspaceId: 'ws-1',
        accountType: 'SELLER',
        email: 'maria@test.com',
        displayName: 'ACME',
      }),
    );
    expect(connectService.submitOnboardingProfile).toHaveBeenCalledWith(
      partialMatch({
        stripeAccountId: 'acct_created',
        businessType: 'company',
        company: partialMatch({ name: 'ACME Comercio LTDA', taxId: '12.345.678/0001-90' }),
        individual: partialMatch({
          firstName: 'João',
          lastName: 'Souza',
          idNumber: '987.654.321-00',
        }),
        externalAccount: partialMatch({ accountHolderType: 'company' }),
      }),
    );
  });

  it('omits the external account when bank data has no usable digits', async () => {
    prisma.bankAccount.findFirst.mockResolvedValue({
      ...BANK,
      bankCode: '--',
      agency: '--',
      account: '--',
    });

    await syncSellerConnectOnboarding(deps, 'a-1', 'ws-1');

    const submitted = submittedProfile();
    expect(submitted).not.toHaveProperty('externalAccount');
    expect(submitted).not.toHaveProperty('tosAcceptance');
  });
});
