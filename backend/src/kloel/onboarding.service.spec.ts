import { OnboardingService } from './onboarding.service';

type KloelMemoryMock = {
  findUnique: jest.Mock;
  upsert: jest.Mock;
};

type TransactionClientMock = {
  kloelMemory: KloelMemoryMock;
};

type OnboardingServiceUnderTest = {
  saveProfile: OnboardingService['saveProfile'];
  getStatus: OnboardingService['getStatus'];
  steps: Array<{ id: string; question: string; field: string }>;
  prisma: {
    kloelMemory: KloelMemoryMock;
    $transaction: jest.Mock;
  };
};

function buildService() {
  const tx: TransactionClientMock = {
    kloelMemory: {
      findUnique: jest.fn(),
      upsert: jest.fn().mockResolvedValue({ id: 'memory-1' }),
    },
  };
  const service = Object.create(OnboardingService.prototype) as OnboardingServiceUnderTest;
  service.steps = [{ id: 'profile', question: 'Profile?', field: 'profile' }];
  service.prisma = {
    kloelMemory: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ id: 'memory-1' }),
    },
    $transaction: jest
      .fn()
      .mockImplementation(async (handler: (client: TransactionClientMock) => Promise<void>) =>
        handler(tx),
      ),
  };
  return { service, tx };
}

describe('OnboardingService profile persistence', () => {
  it('persists first-login profile and setup checklist in KloelMemory', async () => {
    const { service, tx } = buildService();

    const result = await service.saveProfile('ws-1', {
      userType: 'producer',
      productType: 'digital',
      primaryChannel: 'whatsapp',
      hasProduct: true,
      hasCheckout: false,
      aiUseCase: 'sales',
    });

    expect(tx.kloelMemory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId_key: { workspaceId: 'ws-1', key: 'onboarding_profile' } },
        create: expect.objectContaining({
          workspaceId: 'ws-1',
          key: 'onboarding_profile',
          category: 'system',
          type: 'onboarding_profile',
        }),
      }),
    );
    expect(tx.kloelMemory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId_key: { workspaceId: 'ws-1', key: 'onboarding_setup_checklist' } },
        create: expect.objectContaining({
          workspaceId: 'ws-1',
          key: 'onboarding_setup_checklist',
          category: 'system',
          type: 'setup_checklist',
        }),
      }),
    );
    expect(result.nextMissingStep).toBe('checkout');
  });

  it('returns persisted profile/checklist in status', async () => {
    const { service } = buildService();
    service.prisma.kloelMemory.findUnique
      .mockResolvedValueOnce({
        value: { currentStep: 0, data: {}, completed: false },
      })
      .mockResolvedValueOnce({
        value: { userType: 'affiliate' },
      })
      .mockResolvedValueOnce({
        value: [{ key: 'profile', completed: true }],
      });

    const status = await service.getStatus('ws-1');

    expect(status.profile).toEqual({ userType: 'affiliate' });
    expect(status.checklist).toEqual([{ key: 'profile', completed: true }]);
  });
});
