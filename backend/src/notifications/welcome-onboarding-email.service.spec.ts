import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from '../auth/email.service';
import { WelcomeAndOnboardingEmailService } from './welcome-onboarding-email.service';

jest.mock('bullmq', () => {
  const _add = jest.fn().mockResolvedValue(undefined);
  const _queueClose = jest.fn().mockResolvedValue(undefined);
  const _workerClose = jest.fn().mockResolvedValue(undefined);

  return {
    Queue: jest.fn().mockImplementation(() => ({
      add: _add,
      close: _queueClose,
    })),
    Worker: jest.fn().mockImplementation(() => ({
      close: _workerClose,
      on: jest.fn(),
    })),
    __add: _add,
    __queueClose: _queueClose,
    __workerClose: _workerClose,
  };
});

describe('WelcomeAndOnboardingEmailService', () => {
  let module: TestingModule;
  let service: WelcomeAndOnboardingEmailService;
  let emailService: { sendWelcomeEmail: jest.Mock; sendOnboardingEmail: jest.Mock };
  let mockAdd: jest.Mock;
  let mockQueueClose: jest.Mock;
  let mockWorkerClose: jest.Mock;

  beforeEach(async () => {
    const bullmq = jest.requireMock('bullmq');
    mockAdd = bullmq.__add;
    mockQueueClose = bullmq.__queueClose;
    mockWorkerClose = bullmq.__workerClose;

    emailService = {
      sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
      sendOnboardingEmail: jest.fn().mockResolvedValue(undefined),
    };

    jest.clearAllMocks();

    module = await Test.createTestingModule({
      providers: [
        WelcomeAndOnboardingEmailService,
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    service = module.get<WelcomeAndOnboardingEmailService>(WelcomeAndOnboardingEmailService);
    await module.init();
  });

  afterEach(async () => {
    await module.close();
  });

  describe('sendWelcomeEmail', () => {
    it('calls emailService.sendWelcomeEmail with the correct parameters', async () => {
      await service.sendWelcomeEmail('agent@test.com', 'Agent Name', 'Workspace Inc');

      expect(emailService.sendWelcomeEmail).toHaveBeenCalledWith(
        'agent@test.com',
        'Agent Name',
        'Workspace Inc',
        undefined,
      );
    });

    it('logs error but does not throw when email sending fails', async () => {
      emailService.sendWelcomeEmail.mockRejectedValue(new Error('SMTP down'));

      await expect(
        service.sendWelcomeEmail('agent@test.com', 'Agent Name', 'WS'),
      ).resolves.toBeUndefined();
    });
  });

  describe('scheduleOnboardingSequence', () => {
    it('schedules 3 delayed jobs: day 1, day 3, and day 7', async () => {
      await service.scheduleOnboardingSequence('agent@test.com', 'Agent');

      expect(mockAdd).toHaveBeenCalledTimes(3);

      expect(mockAdd).toHaveBeenCalledWith(
        'onboarding-day1',
        { email: 'agent@test.com', agentName: 'Agent', template: 'onboarding-day1' },
        expect.objectContaining({
          delay: 24 * 60 * 60 * 1000,
          jobId: 'onboarding:onboarding-day1:agent@test.com',
        }),
      );
      expect(mockAdd).toHaveBeenCalledWith(
        'onboarding-day3',
        { email: 'agent@test.com', agentName: 'Agent', template: 'onboarding-day3' },
        expect.objectContaining({ delay: 3 * 24 * 60 * 60 * 1000 }),
      );
      expect(mockAdd).toHaveBeenCalledWith(
        'onboarding-day7',
        { email: 'agent@test.com', agentName: 'Agent', template: 'onboarding-day7' },
        expect.objectContaining({ delay: 7 * 24 * 60 * 60 * 1000 }),
      );
    });
  });

  describe('onModuleDestroy', () => {
    it('closes both worker and queue', async () => {
      await service.onModuleDestroy();

      expect(mockWorkerClose).toHaveBeenCalled();
      expect(mockQueueClose).toHaveBeenCalled();
    });
  });
});
