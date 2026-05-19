import { Test, TestingModule } from '@nestjs/testing';
import { INBOX_SERVICE } from '../inbox/inbox.token';
import { NeuroCrmService } from '../crm/neuro-crm.service';
import { DecisionOutcomeService } from '../kloel/decision-outcome.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../workspaces/workspace.service';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { WhatsappReconcilerService } from './whatsapp-reconciler.service';

jest.mock('../queue/queue', () => ({
  flowQueue: { add: jest.fn().mockResolvedValue(undefined) },
  autopilotQueue: { add: jest.fn().mockResolvedValue(undefined) },
}));

const makeWorkspace = (overrides: Record<string, unknown> = {}) => ({
  id: 'ws-1',
  name: 'Test',
  providerSettings: { whatsappProvider: 'meta-cloud', ...overrides },
});

describe('WhatsappReconcilerService', () => {
  let service: WhatsappReconcilerService;
  let redis: {
    get: jest.Mock;
    set: jest.Mock;
    setex: jest.Mock;
    rpush: jest.Mock;
    expire: jest.Mock;
    publish: jest.Mock;
  };
  let inbox: { saveMessageByPhone: jest.Mock };
  let workspaces: { getWorkspace: jest.Mock };
  let neuroCrm: { analyzeContact: jest.Mock };
  let prisma: {
    contact: { findUnique: jest.Mock; upsert: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    tag: { upsert: jest.Mock; findUnique: jest.Mock };
    autopilotEvent: { findFirst: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
  };
  let providerRegistry: { upsertContactProfile: jest.Mock };

  beforeEach(async () => {
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      setex: jest.fn().mockResolvedValue('OK'),
      rpush: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      publish: jest.fn().mockResolvedValue(0),
    };
    inbox = { saveMessageByPhone: jest.fn().mockResolvedValue({ id: 'msg-1', contactId: 'c-1' }) };
    workspaces = { getWorkspace: jest.fn().mockResolvedValue(makeWorkspace()) };
    neuroCrm = { analyzeContact: jest.fn().mockResolvedValue(undefined) };
    prisma = {
      contact: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      tag: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
      },
      autopilotEvent: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest
        .fn()
        .mockImplementation((cb: (tx: unknown) => Promise<unknown>) => cb(prisma)),
    };
    providerRegistry = { upsertContactProfile: jest.fn().mockResolvedValue(true) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappReconcilerService,
        { provide: WorkspaceService, useValue: workspaces },
        { provide: INBOX_SERVICE, useValue: inbox },
        { provide: 'default_IORedisModuleConnectionToken', useValue: redis },
        { provide: NeuroCrmService, useValue: neuroCrm },
        { provide: PrismaService, useValue: prisma },
        { provide: WhatsAppProviderRegistry, useValue: providerRegistry },
        {
          provide: DecisionOutcomeService,
          useValue: {
            closeOutcome: jest.fn(),
            recordDecision: jest.fn(),
            recordEvent: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: OpsAlertService, useValue: { alertOnCriticalError: jest.fn() } },
      ],
    }).compile();
    service = module.get(WhatsappReconcilerService);
  });

  describe('handleIncoming', () => {
    it('rejects when workspace is not found', async () => {
      workspaces.getWorkspace.mockResolvedValue(null);
      await expect(service.handleIncoming('ws-1', '5511999991234', 'hello')).rejects.toThrow(
        'Workspace not found',
      );
    });

    it('skips duplicate messages via redis dedupe', async () => {
      redis.get.mockResolvedValue('1');
      const result = await service.handleIncoming('ws-1', '5511999991234', 'hello');
      expect(result).toEqual({ skipped: true, reason: 'duplicate' });
    });

    it('saves inbound message to inbox and returns ok', async () => {
      const result = await service.handleIncoming('ws-1', '5511999991234', 'hello');
      expect(inbox.saveMessageByPhone).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          phone: '5511999991234',
          content: 'hello',
          direction: 'INBOUND',
        }),
      );
      expect(result).toHaveProperty('ok', true);
    });

    it('enqueues resume-flow job', async () => {
      const { flowQueue } = jest.requireMock('../queue/queue');
      await service.handleIncoming('ws-1', '5511999991234', 'hello');
      expect(flowQueue.add).toHaveBeenCalledWith(
        'resume-flow',
        expect.objectContaining({}),
        expect.objectContaining({}),
      );
    });

    it('enqueues autopilot scan-contact when autonomous is enabled', async () => {
      const ws = makeWorkspace({ autopilot: { enabled: true } });
      workspaces.getWorkspace.mockResolvedValue(ws);
      inbox.saveMessageByPhone.mockResolvedValue({ id: 'msg-2', contactId: 'c-2' });
      redis.set.mockResolvedValue('OK');
      const { autopilotQueue } = jest.requireMock('../queue/queue');
      await service.handleIncoming('ws-1', '5511999991234', 'hello');
      expect(autopilotQueue.add).toHaveBeenCalledWith(
        'scan-contact',
        expect.objectContaining({ workspaceId: 'ws-1', contactId: 'c-2' }),
        expect.objectContaining({}),
      );
    });

    it('enqueues hot-flow when keyword matches and hotFlowId is set', async () => {
      const ws = makeWorkspace({ autopilot: { enabled: false, hotFlowId: 'flow-99' } });
      workspaces.getWorkspace.mockResolvedValue(ws);
      const { flowQueue } = jest.requireMock('../queue/queue');
      flowQueue.add.mockClear();
      await service.handleIncoming('ws-1', '5511999991234', 'quanto custa?');
      const runFlowCall = flowQueue.add.mock.calls.find(
        (call: unknown[]) => call[0] === 'run-flow',
      );
      expect(runFlowCall).toBeDefined();
      if (runFlowCall) {
        expect(runFlowCall[1]).toMatchObject({ flowId: 'flow-99' });
      }
    });

    it('records BUYING intent for payment keywords when recent event exists', async () => {
      const ws = makeWorkspace({ autopilot: { enabled: false } });
      workspaces.getWorkspace.mockResolvedValue(ws);
      inbox.saveMessageByPhone.mockResolvedValue({ id: 'msg-3', contactId: 'c-3' });
      prisma.autopilotEvent.findFirst.mockResolvedValue({
        createdAt: new Date(),
      });
      await service.handleIncoming('ws-1', '5511999991234', 'paguei o boleto');
      expect(prisma.autopilotEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ intent: 'BUYING' }) }),
      );
    });

    it('publishes copilot event via redis', async () => {
      await service.handleIncoming('ws-1', '5511999991234', 'hello');
      expect(redis.publish).toHaveBeenCalledWith(
        'ws:copilot:ws-1',
        expect.stringContaining('new_message'),
      );
    });

    it('triggers opt-out when stop keyword detected', async () => {
      inbox.saveMessageByPhone.mockResolvedValue({ id: 'msg-4', contactId: 'c-4' });
      prisma.contact.findUnique.mockResolvedValue({ id: 'c-4' });
      await service.handleIncoming('ws-1', '5511999991234', 'stop please');
      expect(prisma.contact.updateMany).toHaveBeenCalled();
    });
  });

  describe('syncRemoteContactProfile', () => {
    it('returns false when phone is empty', async () => {
      const result = await service.syncRemoteContactProfile('ws-1', '');
      expect(result).toBe(false);
    });

    it('returns false when name is empty', async () => {
      const result = await service.syncRemoteContactProfile('ws-1', '5511', '');
      expect(result).toBe(false);
    });

    it('calls providerRegistry.upsertContactProfile with normalized data', async () => {
      const result = await service.syncRemoteContactProfile('ws-1', '5511999991234', 'Alice');
      expect(providerRegistry.upsertContactProfile).toHaveBeenCalledWith('ws-1', {
        phone: '5511999991234',
        name: 'Alice',
      });
      expect(result).toBe(true);
    });
  });

  describe('optInContact', () => {
    it('upserts contact and tag and returns ok', async () => {
      prisma.contact.upsert.mockResolvedValue({ id: 'c-1' });
      prisma.tag.upsert.mockResolvedValue({ id: 't-1' });
      const result = await service.optInContact('ws-1', '5511999991234');
      expect(result).toEqual({ ok: true });
      expect(prisma.contact.upsert).toHaveBeenCalled();
      expect(prisma.tag.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ name: 'optin_whatsapp' }) }),
      );
    });
  });

  describe('optOutContact', () => {
    it('returns ok when contact not found', async () => {
      prisma.contact.findUnique.mockResolvedValue(null);
      const result = await service.optOutContact('ws-1', '5511999991234');
      expect(result).toEqual({ ok: true });
    });

    it('updates contact and disconnects tag when contact exists', async () => {
      prisma.contact.findUnique.mockResolvedValue({ id: 'c-1' });
      prisma.tag.findUnique.mockResolvedValue({ id: 't-1' });
      const result = await service.optOutContact('ws-1', '5511999991234');
      expect(result).toEqual({ ok: true });
      expect(prisma.contact.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ optIn: false }) }),
      );
    });
  });

  describe('optInBulk', () => {
    it('processes unique phones sequentially', async () => {
      prisma.contact.upsert.mockResolvedValue({ id: 'c-1' });
      prisma.tag.upsert.mockResolvedValue({ id: 't-1' });
      const result = await service.optInBulk('ws-1', ['5511a', '5511b', '5511a']);
      expect(result.ok).toBe(true);
      expect(result.processed).toBe(2);
      expect(result.results).toHaveLength(2);
    });
  });

  describe('getOptInStatus', () => {
    it('returns contactExists false when not found', async () => {
      prisma.contact.findUnique.mockResolvedValue(null);
      const result = await service.getOptInStatus('ws-1', '5511999991234');
      expect(result).toEqual({ optIn: false, contactExists: false });
    });

    it('returns optIn true when tag exists', async () => {
      prisma.contact.findUnique.mockResolvedValue({
        id: 'c-1',
        tags: [{ name: 'optin_whatsapp' }],
      });
      const result = await service.getOptInStatus('ws-1', '5511999991234');
      expect(result).toEqual({ optIn: true, contactExists: true });
    });
  });
});
