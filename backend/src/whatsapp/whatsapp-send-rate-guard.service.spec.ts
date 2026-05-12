import { Test, TestingModule } from '@nestjs/testing';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { WhatsappService } from './whatsapp.service';
import { WhatsappSendRateGuardService } from './whatsapp-send-rate-guard.service';

jest.mock('../queue/queue', () => ({
  flowQueue: { add: jest.fn().mockResolvedValue(undefined) },
  autopilotQueue: { add: jest.fn().mockResolvedValue(undefined) },
}));

describe('WhatsappSendRateGuardService', () => {
  let service: WhatsappSendRateGuardService;
  let planLimits: {
    ensureMessageRate: jest.Mock;
    ensureDailyMessageQuota: jest.Mock;
  };

  beforeEach(async () => {
    planLimits = {
      ensureMessageRate: jest.fn().mockResolvedValue(undefined),
      ensureDailyMessageQuota: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappSendRateGuardService,
        { provide: PlanLimitsService, useValue: planLimits },
      ],
    }).compile();
    service = module.get(WhatsappSendRateGuardService);
  });

  describe('onModuleInit', () => {
    beforeEach(() => {
      const proto = WhatsappService.prototype as Record<string | symbol, unknown>;
      delete proto[Symbol.for('kloel.whatsapp.sendRateGuard.patched')];
      proto.sendMessage = async function (...args: unknown[]) {
        return { ok: true, args };
      };
      proto.sendTemplate = async function (...args: unknown[]) {
        return { ok: true, templateArgs: args };
      };
      proto.sendDirectMessage = async function (...args: unknown[]) {
        return { ok: true, directArgs: args };
      };
    });

    afterEach(() => {
      const proto = WhatsappService.prototype as Record<string | symbol, unknown>;
      delete proto[Symbol.for('kloel.whatsapp.sendRateGuard.patched')];
    });

    it('patches sendMessage on the prototype', () => {
      expect(typeof WhatsappService.prototype.sendMessage).toBe('function');

      service.onModuleInit();

      expect(typeof WhatsappService.prototype.sendMessage).toBe('function');
    });

    it('calls ensureDailyMessageQuota and ensureMessageRate before original sendMessage', async () => {
      service.onModuleInit();

      const patchedSend = WhatsappService.prototype.sendMessage as (
        ...args: unknown[]
      ) => Promise<unknown>;
      await patchedSend.call({} as WhatsappService, 'ws-1', '5511', 'hello');

      expect(planLimits.ensureDailyMessageQuota).toHaveBeenCalledWith('ws-1');
      expect(planLimits.ensureMessageRate).toHaveBeenCalledWith('ws-1');
    });

    it('calls ensureDailyMessageQuota and ensureMessageRate before original sendTemplate', async () => {
      service.onModuleInit();

      const patched = WhatsappService.prototype.sendTemplate as (
        ...args: unknown[]
      ) => Promise<unknown>;
      await patched.call({} as WhatsappService, 'ws-1', '5511', {});

      expect(planLimits.ensureDailyMessageQuota).toHaveBeenCalledWith('ws-1');
      expect(planLimits.ensureMessageRate).toHaveBeenCalledWith('ws-1');
    });

    it('calls ensureDailyMessageQuota and ensureMessageRate before original sendDirectMessage', async () => {
      service.onModuleInit();

      const patched = WhatsappService.prototype.sendDirectMessage as (
        ...args: unknown[]
      ) => Promise<unknown>;
      await patched.call({} as WhatsappService, 'ws-1', '5511', 'hello');

      expect(planLimits.ensureDailyMessageQuota).toHaveBeenCalledWith('ws-1');
      expect(planLimits.ensureMessageRate).toHaveBeenCalledWith('ws-1');
    });

    it('does not call rate-limit when workspaceId is not a string', async () => {
      service.onModuleInit();

      const patchedSend = WhatsappService.prototype.sendMessage as (
        ...args: unknown[]
      ) => Promise<unknown>;
      await patchedSend.call({} as WhatsappService, null, '5511', 'hello');

      expect(planLimits.ensureDailyMessageQuota).not.toHaveBeenCalled();
      expect(planLimits.ensureMessageRate).not.toHaveBeenCalled();
    });

    it('is idempotent — does not double-patch', () => {
      service.onModuleInit();
      const firstHook = WhatsappService.prototype.sendMessage;
      service.onModuleInit();
      const secondHook = WhatsappService.prototype.sendMessage;
      expect(secondHook).toBe(firstHook);
    });
  });
});
