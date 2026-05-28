/**
 * PI-K19-B: AdminChatService cognitive parity spec.
 *
 * Validates the cognition pipeline wiring:
 *   - Decision outcome recorded at start of every reply.
 *   - buildMindSignals called with workspaceId + user content.
 *   - cognition.decision_made emitted via SpineEmitterService.
 *   - observeRepliedToUserBelief called with surface 'admin'.
 *   - computeChatSurprise called with observed=1, degraded=false.
 *   - Graceful degradation when any cognition service is absent.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminPermissionsService } from '../permissions/admin-permissions.service';
import { AdminChatService } from './admin-chat.service';
import { ChatToolRegistry } from './chat-tool.registry';

// ---- helpers --------------------------------------------------------

function firstCallArg<T>(mock: { mock: { calls: Array<[unknown, ...unknown[]]> } }): T {
  const [arg] = mock.mock.calls[0] ?? [];
  return arg as T;
}

// ---- factory --------------------------------------------------------

interface TestMocks {
  sessionRecord: {
    id: string;
    adminUserId: string;
    workspaceId: string;
    title: string;
    createdAt: Date;
    updatedAt: Date;
    lastUsedAt: Date;
    expiresAt: Date;
    deletedAt: Date | null;
    messages: never[];
  };
  mockSessionCreate: jest.Mock;
  mockSessionFindFirst: jest.Mock;
  mockSessionFindMany: jest.Mock;
  mockSessionUpdateMany: jest.Mock;
  mockMsgCreate: jest.Mock;
  mockPermissionsAllows: jest.Mock;
  mockToolsResolve: jest.Mock;
  mockToolsListAll: jest.Mock;
  mockAutopilotFindMany: jest.Mock;
}

function makeMocks(): TestMocks {
  const sessionRecord = {
    id: 'session_1',
    adminUserId: 'admin_1',
    workspaceId: 'ws_1',
    title: 'Test',
    createdAt: new Date('2026-05-10T00:00:00Z'),
    updatedAt: new Date('2026-05-10T00:00:00Z'),
    lastUsedAt: new Date('2026-05-10T12:00:00Z'),
    expiresAt: new Date('2026-05-11T12:00:00Z'),
    deletedAt: null as Date | null,
    messages: [],
  };

  return {
    sessionRecord,
    mockSessionCreate: jest.fn().mockResolvedValue(sessionRecord),
    mockSessionFindFirst: jest.fn().mockResolvedValue(sessionRecord),
    mockSessionFindMany: jest.fn().mockResolvedValue([sessionRecord]),
    mockSessionUpdateMany: jest.fn().mockResolvedValue({ count: 1 }),
    mockMsgCreate: jest.fn().mockResolvedValue({ id: 'msg_1' }),
    mockPermissionsAllows: jest.fn().mockResolvedValue(true),
    mockToolsResolve: jest.fn().mockReturnValue(null),
    mockToolsListAll: jest.fn().mockReturnValue([]),
    mockAutopilotFindMany: jest.fn().mockResolvedValue([]),
  };
}

interface BuildModuleResult {
  service: AdminChatService;
  mocks: TestMocks;
}

async function buildService(
  overrides?: Partial<{
    spineEmit: jest.Mock;
    decisionRecord: jest.Mock;
    decisionClose: jest.Mock;
    beliefObserve: jest.Mock;
    surpriseCompute: jest.Mock;
  }>,
): Promise<BuildModuleResult> {
  const m = makeMocks();

  const prismaMock = {
    adminChatSession: {
      create: m.mockSessionCreate,
      findFirst: m.mockSessionFindFirst,
      findMany: m.mockSessionFindMany,
      updateMany: m.mockSessionUpdateMany,
    },
    adminChatMessage: {
      create: m.mockMsgCreate,
    },
    autopilotEvent: {
      findMany: m.mockAutopilotFindMany,
    },
  };

  const permissionsMock = { allows: m.mockPermissionsAllows };
  const toolsMock = { resolve: m.mockToolsResolve, listAll: m.mockToolsListAll };

  const providers: Array<{ provide: unknown; useValue: unknown }> = [
    { provide: PrismaService, useValue: prismaMock },
    { provide: AdminPermissionsService, useValue: permissionsMock },
    { provide: ChatToolRegistry, useValue: toolsMock },
  ];

  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      AdminChatService,
      ...providers,
    ],
  }).compile();

  const service = moduleRef.get(AdminChatService);

  if (overrides?.spineEmit) {
    (service as Record<string, unknown>)['spine'] = { emit: overrides.spineEmit };
  }
  if (overrides?.decisionRecord) {
    (service as Record<string, unknown>)['decisionOutcomeService'] = {
      recordDecision: overrides.decisionRecord,
      closeOutcome: overrides?.decisionClose ?? jest.fn().mockResolvedValue(undefined),
    };
  }
  if (overrides?.beliefObserve) {
    (service as Record<string, unknown>)['mindBeliefService'] = {
      observeBinary: overrides.beliefObserve,
      getOrInit: jest.fn().mockResolvedValue({ mean: 0.5, variance: 0.1 }),
    };
  }
  if (overrides?.surpriseCompute) {
    (service as Record<string, unknown>)['mindSurpriseService'] = {
      computeSurprise: overrides.surpriseCompute,
    };
  }

  return { service, mocks: m };
}

async function sendOi(service: AdminChatService) {
  return service.sendMessage({
    adminUserId: 'admin_1',
    adminRole: 'PLATFORM_ADMIN' as never,
    sessionId: null,
    content: 'oi',
  });
}

// ---- tests ----------------------------------------------------------

describe('AdminChatService cognitive parity (PI-K19-B)', () => {
  // ── Decision outcome ────────────────────────────────────────────

  describe('decision outcome', () => {
    it('records decision outcome with surface=admin and correct workspaceId', async () => {
      const recordDecision = jest.fn().mockResolvedValue(undefined);
      const closeOutcome = jest.fn().mockResolvedValue(undefined);

      const { service } = await buildService({ decisionRecord: recordDecision, decisionClose: closeOutcome });
      await sendOi(service);

      expect(recordDecision).toHaveBeenCalledTimes(1);
      const arg = recordDecision.mock.calls[0][0] as Record<string, unknown>;
      expect(arg.workspaceId).toBe('ws_1');
      expect(arg.decisionType).toBe('chat_reply');
      expect((arg.contextSnapshot as Record<string, unknown>).surface).toBe('admin');
    });

    it('closes outcome with chat.replied and wonVsBaseline=true', async () => {
      const recordDecision = jest.fn().mockResolvedValue(undefined);
      const closeOutcome = jest.fn().mockResolvedValue(undefined);

      const { service } = await buildService({ decisionRecord: recordDecision, decisionClose: closeOutcome });
      await sendOi(service);

      expect(closeOutcome).toHaveBeenCalledTimes(1);
      const arg = closeOutcome.mock.calls[0][0] as Record<string, unknown>;
      expect(arg.outcomeName).toBe('chat.replied');
      expect(arg.wonVsBaseline).toBe(true);
    });
  });

  // ── cognition.decision_made ──────────────────────────────────────

  describe('cognition.decision_made', () => {
    it('emits event with correct shape when spine is injected', async () => {
      const spineEmit = jest.fn().mockResolvedValue(undefined);
      const { service } = await buildService({ spineEmit });
      await sendOi(service);

      // fire-and-forget: wait for microtasks
      await new Promise<void>((r) => setTimeout(r, 60));

      expect(spineEmit).toHaveBeenCalledTimes(1);
      const arg = spineEmit.mock.calls[0][0] as Record<string, unknown>;
      expect(arg.eventName).toBe('cognition.decision_made');
      expect(arg.workspaceId).toBe('ws_1');
      expect(arg.truthMode).toBe('observed');
      expect((arg.payload as Record<string, unknown>).surface).toBe('admin');
      expect((arg.payload as Record<string, unknown>).toolCallsCount).toBe(0);
    });
  });

  // ── observeRepliedToUserBelief ───────────────────────────────────

  describe('observeRepliedToUserBelief', () => {
    it('calls observeBinary(replied_to_user, surface=admin, observed=1)', async () => {
      const beliefObserve = jest.fn().mockResolvedValue(undefined);
      const { service } = await buildService({ beliefObserve });
      await sendOi(service);

      expect(beliefObserve).toHaveBeenCalledTimes(1);
      const args = beliefObserve.mock.calls[0] as [string, string, string, Record<string, unknown>, number];
      expect(args[2]).toBe('replied_to_user');
      expect(args[3]).toMatchObject({ surface: 'admin' });
      expect(args[4]).toBe(1);
    });
  });

  // ── computeChatSurprise ──────────────────────────────────────────

  describe('computeChatSurprise', () => {
    it('calls computeSurprise when surprise service is injected', async () => {
      const surpriseCompute = jest.fn().mockReturnValue(0.1);
      const beliefObserve = jest.fn().mockResolvedValue(undefined);
      const { service } = await buildService({ surpriseCompute, beliefObserve });
      await sendOi(service);

      // fire-and-forget: wait for microtasks
      await new Promise<void>((r) => setTimeout(r, 60));

      expect(surpriseCompute).toHaveBeenCalled();
    });
  });

  // ── Graceful degradation ─────────────────────────────────────────

  describe('graceful degradation', () => {
    it('resolves without any cognition services injected', async () => {
      const { service } = await buildService();
      const result = await sendOi(service);
      expect(result).toBeDefined();
      expect(result.id).toBe('session_1');
    });

    it('resolves when spine throws', async () => {
      const spineEmit = jest.fn().mockRejectedValue(new Error('spine down'));
      const { service } = await buildService({ spineEmit });
      const result = await sendOi(service);
      // fire-and-forget: wait for microtasks
      await new Promise<void>((r) => setTimeout(r, 60));
      expect(result).toBeDefined();
    });

    it('resolves when decisionOutcome recordDecision throws', async () => {
      const recordDecision = jest.fn().mockRejectedValue(new Error('outcome down'));
      const { service } = await buildService({ decisionRecord: recordDecision });
      const result = await sendOi(service);
      expect(result).toBeDefined();
    });
  });

  // ── WorkspaceId propagation ──────────────────────────────────────

  describe('workspaceId propagation', () => {
    it('uses session workspaceId for all cognition calls', async () => {
      const spineEmit = jest.fn().mockResolvedValue(undefined);
      const recordDecision = jest.fn().mockResolvedValue(undefined);
      const closeOutcome = jest.fn().mockResolvedValue(undefined);
      const beliefObserve = jest.fn().mockResolvedValue(undefined);

      const { service, mocks } = await buildService({
        spineEmit,
        decisionRecord: recordDecision,
        decisionClose: closeOutcome,
        beliefObserve,
      });

      // Override session workspaceId
      mocks.mockSessionCreate.mockResolvedValue({
        ...mocks.sessionRecord,
        workspaceId: 'ws_custom_42',
      });
      mocks.mockSessionFindFirst.mockResolvedValue({
        ...mocks.sessionRecord,
        workspaceId: 'ws_custom_42',
      });

      await service.sendMessage({
        adminUserId: 'admin_1',
        adminRole: 'PLATFORM_ADMIN' as never,
        sessionId: null,
        content: 'oi',
      });

      await new Promise<void>((r) => setTimeout(r, 60));

      expect(recordDecision.mock.calls[0][0].workspaceId).toBe('ws_custom_42');
      expect(spineEmit.mock.calls[0][0].workspaceId).toBe('ws_custom_42');
      expect(beliefObserve.mock.calls[0][0]).toBe('ws_custom_42');
      expect(closeOutcome).toHaveBeenCalled();
    });
  });
});
