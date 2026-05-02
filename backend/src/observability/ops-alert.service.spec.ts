import { Test, TestingModule } from '@nestjs/testing';
import * as Sentry from '@sentry/node';
import { PrismaService } from '../prisma/prisma.service';
import { OpsAlertService } from './ops-alert.service';

jest.mock('@sentry/node', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

describe('OpsAlertService', () => {
  let service: OpsAlertService;
  let prisma: {
    opsEvent: {
      create: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      opsEvent: {
        create: jest.fn(),
      },
    };

    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [OpsAlertService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<OpsAlertService>(OpsAlertService);
  });

  describe('alertOnCriticalError', () => {
    it('logs with OPS_CRITICAL prefix and forwards to Sentry', async () => {
      const error = new Error('db connection lost');
      const context = 'PrismaService.connect';
      const loggerSpy = jest.spyOn((service as any).logger, 'error');

      await service.alertOnCriticalError(error, context);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('OPS_CRITICAL | PrismaService.connect | db connection lost'),
        error.stack,
      );
      expect(Sentry.captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          tags: { type: 'ops_critical', context },
          level: 'error',
        }),
      );
    });

    it('handles string errors by wrapping in Error object', async () => {
      const loggerSpy = jest.spyOn((service as any).logger, 'error');

      await service.alertOnCriticalError('timeout', 'Queue.worker');

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('timeout'),
        expect.any(String),
      );
    });

    it('handles unknown errors by wrapping with fallback message', async () => {
      const loggerSpy = jest.spyOn((service as any).logger, 'error');

      await service.alertOnCriticalError({ foo: 1 }, 'SomeService.method');

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('unknown error'),
        expect.any(String),
      );
    });

    it('includes workspaceId in log when provided', async () => {
      const extra = { workspaceId: 'ws-42' };
      const loggerSpy = jest.spyOn((service as any).logger, 'error');

      await service.alertOnCriticalError(new Error('fail'), 'Svc.m', extra);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('ws=ws-42'),
        expect.any(String),
      );
    });

    it('persists an OpsEvent row in the database', async () => {
      const error = new Error('critical failure');
      const extra = { workspaceId: 'ws-1', metadata: { detail: 'sample' } };

      await service.alertOnCriticalError(error, 'Svc.method', extra);

      expect(prisma.opsEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'critical_error',
          service: 'Svc.method',
          error: 'critical failure',
          stack: error.stack,
          workspaceId: 'ws-1',
        }),
      });
    });

    it('does not throw when Sentry is uninitialised', async () => {
      (Sentry.captureException as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Sentry not init');
      });

      await expect(
        service.alertOnCriticalError(new Error('fail'), 'Svc.m'),
      ).resolves.toBeUndefined();
    });

    it('does not throw when prisma opsEvent.create fails', async () => {
      prisma.opsEvent.create.mockRejectedValueOnce(new Error('db down'));

      await expect(
        service.alertOnCriticalError(new Error('fail'), 'Svc.m'),
      ).resolves.toBeUndefined();
    });
  });

  describe('alertOnDegradation', () => {
    it('logs with OPS_DEGRADATION prefix', async () => {
      const loggerSpy = jest.spyOn((service as any).logger, 'warn');

      await service.alertOnDegradation('slow response', 'Api.gateway');

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('OPS_DEGRADATION | Api.gateway | slow response'),
      );
    });

    it('forwards a warning message to Sentry', async () => {
      await service.alertOnDegradation('slow', 'Svc.m');

      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        'Ops degradation: Svc.m - slow',
        expect.objectContaining({ level: 'warning' }),
      );
    });

    it('persists degradation event to database', async () => {
      await service.alertOnDegradation('slow', 'Svc.m', { workspaceId: 'ws-2' });

      expect(prisma.opsEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'degradation',
          service: 'Svc.m',
          error: 'slow',
          workspaceId: 'ws-2',
        }),
      });
    });

    it('handles Sentry failure gracefully', async () => {
      (Sentry.captureMessage as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Sentry not init');
      });

      await expect(service.alertOnDegradation('fail', 'Svc.m')).resolves.toBeUndefined();
    });
  });

  describe('alertOnRecovery', () => {
    it('logs with OPS_RECOVERY prefix', async () => {
      const loggerSpy = jest.spyOn((service as any).logger, 'log');

      await service.alertOnRecovery('db reconnected', 'PrismaService.connect');

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('OPS_RECOVERY | PrismaService.connect | db reconnected'),
      );
    });

    it('persists recovery event to database', async () => {
      await service.alertOnRecovery('back to normal', 'Svc.m', {
        metadata: { source: 'healthcheck' },
      });

      expect(prisma.opsEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'recovery',
          service: 'Svc.m',
          error: 'back to normal',
        }),
      });
    });

    it('does not throw when prisma write fails', async () => {
      prisma.opsEvent.create.mockRejectedValueOnce(new Error('db down'));

      await expect(service.alertOnRecovery('ok', 'Svc.m')).resolves.toBeUndefined();
    });
  });

  describe('without prisma (graceful degradation)', () => {
    let svc: OpsAlertService;

    beforeEach(() => {
      svc = new OpsAlertService(undefined);
    });

    it('handles alertOnCriticalError when prisma is undefined', async () => {
      await expect(svc.alertOnCriticalError(new Error('fail'), 'Svc.m')).resolves.toBeUndefined();
    });

    it('handles alertOnDegradation when prisma is undefined', async () => {
      await expect(svc.alertOnDegradation('slow', 'Svc.m')).resolves.toBeUndefined();
    });

    it('handles alertOnRecovery when prisma is undefined', async () => {
      await expect(svc.alertOnRecovery('ok', 'Svc.m')).resolves.toBeUndefined();
    });
  });
});
