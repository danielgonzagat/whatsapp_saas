/**
 * F3-A passo 2 (DUPLICATION_REGISTER) — pre-cut telemetry for the synthetic
 * 'default' workspace fallback in FlowEngineGlobal.
 *
 * Proves: (1) the structured error `flow_workspace_fallback_default` fires
 * whenever the `|| 'default'` fallback is actually used, and (2) behavior is
 * unchanged — the literal 'default' still propagates to CRM/prisma/queue
 * exactly as before (removal is a separate product decision).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExecutionState, FlowDefinition } from '../flow-engine.types';

const { logError, logInfo, logWarn } = vi.hoisted(() => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}));

vi.mock('../logger', () => ({
  WorkerLogger: class {
    info = logInfo;
    warn = logWarn;
    error = logError;
  },
}));

const { queuePush, memoryQueueAdd, autopilotQueueAdd } = vi.hoisted(() => ({
  queuePush: vi.fn().mockResolvedValue(undefined),
  memoryQueueAdd: vi.fn().mockResolvedValue(undefined),
  autopilotQueueAdd: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../queue', () => ({
  Queue: class {
    on = vi.fn();
    push = queuePush;
    close = vi.fn().mockResolvedValue(undefined);
  },
  memoryQueue: { add: memoryQueueAdd },
  autopilotQueue: { add: autopilotQueueAdd },
}));

const { contextGet, contextSet, contextPublish, contextZrem, contextDelete } = vi.hoisted(() => ({
  contextGet: vi.fn(),
  contextSet: vi.fn().mockResolvedValue(undefined),
  contextPublish: vi.fn().mockResolvedValue(undefined),
  contextZrem: vi.fn().mockResolvedValue(undefined),
  contextDelete: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../context-store', () => ({
  ContextStore: class {
    get = contextGet;
    set = contextSet;
    publish = contextPublish;
    zrem = contextZrem;
    delete = contextDelete;
  },
}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    flowExecution: {
      create: vi.fn().mockResolvedValue({ id: 'exec-1' }),
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    contact: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock('../db', () => ({ prisma: mockPrisma }));

const { crmGetContact, crmAddContact } = vi.hoisted(() => ({
  crmGetContact: vi
    .fn()
    .mockResolvedValue({ id: 'c-1', name: 'User', email: 'u@x.com', customFields: {} }),
  crmAddContact: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../providers/crm', () => ({
  CRM: { getContact: crmGetContact, addContact: crmAddContact },
}));

// Heavy import chains — not exercised by these tests, mocked away.
vi.mock('../flow-node-executor', () => ({ executeNode: vi.fn() }));
vi.mock('../flow-message-sender.helpers', () => ({ sendMessage: vi.fn() }));
vi.mock('../flow-engine-lifecycle', () => ({
  appendLog: vi.fn(),
  failExecution: vi.fn(),
  markStatus: vi.fn(),
}));
vi.mock('../flow-engine-parse', () => ({
  parseFlowDefinition: vi.fn(),
  parseTimeoutMember: vi.fn(),
}));

import { FlowEngineGlobal } from '../flow-engine-global';

const flushAsync = () => new Promise((resolve) => setImmediate(resolve));

const makeFlow = (workspaceId: string): FlowDefinition => ({
  id: 'flow-1',
  name: 'Test Flow',
  nodes: {},
  startNode: 'start',
  workspaceId,
});

const fallbackCalls = () =>
  logError.mock.calls.filter(([event]) => event === 'flow_workspace_fallback_default');

describe('FlowEngineGlobal workspace fallback telemetry (F3-A passo 2)', () => {
  let engine: FlowEngineGlobal;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new FlowEngineGlobal();
  });

  afterEach(async () => {
    await engine.shutdown();
  });

  describe('startFlow', () => {
    it('logs flow_workspace_fallback_default when flow.workspaceId is missing — behavior unchanged', async () => {
      await engine.startFlow('5511999999999', makeFlow(''));

      expect(fallbackCalls()).toHaveLength(1);
      expect(fallbackCalls()[0][1]).toMatchObject({ site: 'startFlow', flowId: 'flow-1' });

      // Behavior unchanged: the synthetic 'default' still flows downstream.
      expect(crmGetContact).toHaveBeenCalledWith('default', expect.any(String));
      expect(mockPrisma.flowExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ workspaceId: 'default' }) }),
      );
      expect(queuePush).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: 'default' }),
      );
    });

    it('does not log the fallback when flow.workspaceId is present', async () => {
      await engine.startFlow('5511999999999', makeFlow('ws-1'));

      expect(fallbackCalls()).toHaveLength(0);
      expect(crmGetContact).toHaveBeenCalledWith('ws-1', expect.any(String));
      expect(queuePush).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'ws-1' }));
    });
  });

  describe('onUserResponse', () => {
    it('logs flow_workspace_fallback_default when neither state nor arg carry a workspaceId — behavior unchanged', async () => {
      contextGet.mockResolvedValue(null); // no persisted state, no workspaceId arg

      await engine.onUserResponse('5511999999999', 'oi');
      await flushAsync(); // fire-and-forget neuro-trigger IIFE

      expect(fallbackCalls()).toHaveLength(1);
      expect(fallbackCalls()[0][1]).toMatchObject({ site: 'onUserResponse' });

      // Behavior unchanged: contact lookup still scoped to the synthetic 'default'.
      expect(mockPrisma.contact.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId_phone: expect.objectContaining({ workspaceId: 'default' }),
          }),
        }),
      );
    });

    it('does not log the fallback when the state carries a workspaceId', async () => {
      const state: ExecutionState = {
        user: '5511999999999',
        flowId: 'flow-1',
        workspaceId: 'ws-1',
        nodeId: 'start',
        variables: {},
        timeoutAt: undefined,
      };
      contextGet.mockResolvedValue(state);

      await engine.onUserResponse('5511999999999', 'oi', 'ws-1');
      await flushAsync();

      expect(fallbackCalls()).toHaveLength(0);
      expect(mockPrisma.contact.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId_phone: expect.objectContaining({ workspaceId: 'ws-1' }),
          }),
        }),
      );
    });
  });
});
