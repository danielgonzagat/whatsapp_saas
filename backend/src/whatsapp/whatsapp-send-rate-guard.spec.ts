import { WhatsappSendRateGuardService } from './whatsapp-send-rate-guard.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { WhatsappService } from './whatsapp.service';

const PATCH_MARKER = Symbol.for('kloel.whatsapp.sendRateGuard.patched');

type PlanLimitsMock = {
  ensureDailyMessageQuota: jest.Mock;
  ensureMessageRate: jest.Mock;
};

function getProto(): Record<string, unknown> {
  return WhatsappService.prototype as unknown as Record<string, unknown>;
}

describe('WhatsappSendRateGuardService', () => {
  let planLimits: PlanLimitsMock;
  let service: WhatsappSendRateGuardService;
  let originalProto: Record<string, unknown>;

  function setupPrototype(methods: Record<string, jest.Mock | undefined>) {
    const proto = Object.create(null) as Record<string, unknown>;
    for (const [key, fn] of Object.entries(methods)) {
      proto[key] = fn;
    }
    Object.defineProperty(WhatsappService, 'prototype', {
      value: proto,
      writable: true,
      configurable: true,
    });
    return proto;
  }

  beforeEach(() => {
    planLimits = {
      ensureDailyMessageQuota: jest.fn().mockResolvedValue(undefined),
      ensureMessageRate: jest.fn().mockResolvedValue(undefined),
    };

    originalProto = getProto();

    setupPrototype({
      sendMessage: jest.fn().mockResolvedValue('sent'),
      sendTemplate: jest.fn().mockResolvedValue('template-sent'),
      sendDirectMessage: jest.fn().mockResolvedValue('direct-sent'),
    });

    service = new WhatsappSendRateGuardService(planLimits as never);
  });

  afterEach(() => {
    Object.defineProperty(WhatsappService, 'prototype', {
      value: originalProto,
      writable: true,
      configurable: true,
    });
  });

  describe('onModuleInit', () => {
    it('patches WhatsappService.prototype methods on module init', () => {
      const proto = getProto();
      const originalSendMessage = proto.sendMessage;
      const originalSendTemplate = proto.sendTemplate;
      const originalSendDirectMessage = proto.sendDirectMessage;

      service.onModuleInit();

      expect(proto.sendMessage).not.toBe(originalSendMessage);
      expect(proto.sendTemplate).not.toBe(originalSendTemplate);
      expect(proto.sendDirectMessage).not.toBe(originalSendDirectMessage);
      expect(typeof proto.sendMessage).toBe('function');
      expect(typeof proto.sendTemplate).toBe('function');
      expect(typeof proto.sendDirectMessage).toBe('function');
      expect(proto[PATCH_MARKER as unknown as string]).toBe(true);
    });

    it('is idempotent — does not re-patch when marker is present', () => {
      const proto = getProto();
      service.onModuleInit();

      const firstSendMessage = proto.sendMessage;
      const firstSendTemplate = proto.sendTemplate;

      service.onModuleInit();

      expect(proto.sendMessage).toBe(firstSendMessage);
      expect(proto.sendTemplate).toBe(firstSendTemplate);
    });

    it('calls ensureDailyMessageQuota and ensureMessageRate before original method', async () => {
      const originalFn = jest.fn().mockResolvedValue('original-result');

      Object.defineProperty(WhatsappService, 'prototype', {
        value: { sendMessage: originalFn },
        writable: true,
        configurable: true,
      });

      service.onModuleInit();

      const proto = getProto();
      const wrapped = proto.sendMessage as (...args: unknown[]) => Promise<unknown>;
      const result = await wrapped.call({} as WhatsappService, 'workspace-123', 'Hello');

      expect(planLimits.ensureDailyMessageQuota).toHaveBeenCalledWith('workspace-123');
      expect(planLimits.ensureMessageRate).toHaveBeenCalledWith('workspace-123');
      // ensureDailyMessageQuota called before ensureMessageRate
      expect(planLimits.ensureDailyMessageQuota.mock.invocationCallOrder[0]).toBeLessThan(
        planLimits.ensureMessageRate.mock.invocationCallOrder[0],
      );
      expect(originalFn).toHaveBeenCalledWith('workspace-123', 'Hello');
      expect(result).toBe('original-result');
    });

    it('skips rate check when workspaceId is not a string', async () => {
      const originalFn = jest.fn().mockResolvedValue('no-quota-check');

      Object.defineProperty(WhatsappService, 'prototype', {
        value: { sendMessage: originalFn },
        writable: true,
        configurable: true,
      });

      service.onModuleInit();

      const proto = getProto();
      const wrapped = proto.sendMessage as (...args: unknown[]) => Promise<unknown>;
      await wrapped.call({} as WhatsappService, 12345, 'Hello');

      expect(planLimits.ensureDailyMessageQuota).not.toHaveBeenCalled();
      expect(planLimits.ensureMessageRate).not.toHaveBeenCalled();
      expect(originalFn).toHaveBeenCalledWith(12345, 'Hello');
    });

    it('skips rate check when workspaceId is an empty string', async () => {
      const originalFn = jest.fn().mockResolvedValue('empty-id');

      Object.defineProperty(WhatsappService, 'prototype', {
        value: { sendMessage: originalFn },
        writable: true,
        configurable: true,
      });

      service.onModuleInit();

      const proto = getProto();
      const wrapped = proto.sendMessage as (...args: unknown[]) => Promise<unknown>;
      await wrapped.call({} as WhatsappService, '', 'Hello');

      expect(planLimits.ensureDailyMessageQuota).not.toHaveBeenCalled();
    });
  });
});
