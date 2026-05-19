import { WhatsappSendRateGuardService } from './whatsapp-send-rate-guard.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { WhatsappService } from './whatsapp.service';

const PATCH_MARKER = Symbol.for('kloel.whatsapp.sendRateGuard.patched');

type PlanLimitsMock = {
  ensureDailyMessageQuota: jest.Mock;
  ensureMessageRate: jest.Mock;
};

const PATCHED_METHODS = ['sendMessage', 'sendTemplate', 'sendDirectMessage'] as const;

type PrototypeSnapshot = Record<(typeof PATCHED_METHODS)[number], unknown> & {
  marker: unknown;
};

function getProto(): Record<string | symbol, unknown> {
  return WhatsappService.prototype as Record<string | symbol, unknown>;
}

describe('WhatsappSendRateGuardService', () => {
  let planLimits: PlanLimitsMock;
  let service: WhatsappSendRateGuardService;
  let originalSnapshot: PrototypeSnapshot;

  function setupPrototype(methods: Record<string, jest.Mock | undefined>) {
    const proto = getProto();
    delete proto[PATCH_MARKER];
    for (const [key, fn] of Object.entries(methods)) {
      proto[key] = fn;
    }
    return proto;
  }

  function snapshotPrototype(): PrototypeSnapshot {
    const proto = getProto();
    return {
      sendMessage: proto.sendMessage,
      sendTemplate: proto.sendTemplate,
      sendDirectMessage: proto.sendDirectMessage,
      marker: proto[PATCH_MARKER],
    };
  }

  function restorePrototype(snapshot: PrototypeSnapshot): void {
    const proto = getProto();
    for (const methodName of PATCHED_METHODS) {
      proto[methodName] = snapshot[methodName];
    }
    if (snapshot.marker === undefined) {
      delete proto[PATCH_MARKER];
      return;
    }
    proto[PATCH_MARKER] = snapshot.marker;
  }

  beforeEach(() => {
    planLimits = {
      ensureDailyMessageQuota: jest.fn().mockResolvedValue(undefined),
      ensureMessageRate: jest.fn().mockResolvedValue(undefined),
    };

    originalSnapshot = snapshotPrototype();

    setupPrototype({
      sendMessage: jest.fn().mockResolvedValue('sent'),
      sendTemplate: jest.fn().mockResolvedValue('template-sent'),
      sendDirectMessage: jest.fn().mockResolvedValue('direct-sent'),
    });

    service = new WhatsappSendRateGuardService(planLimits as never);
  });

  afterEach(() => {
    restorePrototype(originalSnapshot);
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
      expect(proto[PATCH_MARKER as string]).toBe(true);
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

      setupPrototype({ sendMessage: originalFn });

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

      setupPrototype({ sendMessage: originalFn });

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

      setupPrototype({ sendMessage: originalFn });

      service.onModuleInit();

      const proto = getProto();
      const wrapped = proto.sendMessage as (...args: unknown[]) => Promise<unknown>;
      await wrapped.call({} as WhatsappService, '', 'Hello');

      expect(planLimits.ensureDailyMessageQuota).not.toHaveBeenCalled();
    });
  });
});
