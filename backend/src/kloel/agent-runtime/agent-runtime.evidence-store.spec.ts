import { createHash } from 'node:crypto';
import { AgentRuntimeEvidenceStoreService } from './agent-runtime.evidence-store';

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function makeRow(params: {
  workspaceId?: string;
  key?: string;
  id?: string;
  type?: string;
  source?: string;
  content?: string;
  actor?: string | null;
  verification?: string;
  hash?: string;
}) {
  const content = params.content ?? 'runtime observed checkout recovery result';
  const id = params.id ?? 'ev_1';
  return {
    workspaceId: params.workspaceId ?? 'ws_1',
    key: params.key ?? `agent_evidence:${id}`,
    content: `${params.source ?? 'tool_result'}\n${content}`,
    value: {
      kind: 'agent_evidence',
      id,
      type: params.type ?? 'tool_result',
      source: params.source ?? 'tool_result',
      content,
      contentSha256: params.hash ?? sha256(content),
      actor: params.actor ?? null,
      url: null,
      eventTimestamp: null,
      collectedAt: '2026-05-13T12:00:00.000Z',
      verification: params.verification ?? 'single_source',
      notes: null,
      metadata: null,
    },
  };
}

describe('AgentRuntimeEvidenceStoreService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('adds evidence with content hash and chain metadata in kloelMemory', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-13T12:00:00.000Z'));
    type CreateEvidenceArg = {
      data: {
        workspaceId: string;
        key: string;
        category: string;
        type: string | null;
        content: string | null;
        value: unknown;
        metadata: Record<string, unknown>;
      };
    };
    const createEvidence = jest.fn((arg: CreateEvidenceArg) => ({
      workspaceId: arg.data.workspaceId,
      key: arg.data.key,
      content: arg.data.content,
      value: arg.data.value,
    }));
    const prisma = {
      kloelMemory: {
        create: createEvidence,
      },
    };
    const service = new AgentRuntimeEvidenceStoreService(prisma as never);

    const record = await service.add({
      workspaceId: 'ws_1',
      type: 'validation',
      source: 'jest',
      content: 'all runtime persistence tests passed',
      verification: 'single_source',
      actor: 'codex',
    });

    expect(record.workspaceId).toBe('ws_1');
    expect(record.type).toBe('validation');
    expect(record.contentSha256).toBe(sha256('all runtime persistence tests passed'));
    expect(record.actor).toBe('codex');
    expect(createEvidence).toHaveBeenCalledTimes(1);
    const createArg = createEvidence.mock.calls[0]?.[0];
    expect(createArg?.data.workspaceId).toBe('ws_1');
    expect(createArg?.data.category).toBe('agent_evidence');
    expect(createArg?.data.type).toBe('validation');
    expect(createArg?.data.metadata).toMatchObject({
      kind: 'agent_evidence',
      evidenceType: 'validation',
      verification: 'single_source',
    });
  });

  it('lists and filters evidence by type and actor', async () => {
    const prisma = {
      kloelMemory: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            makeRow({ id: 'ev_1', type: 'validation', actor: 'codex' }),
            makeRow({ id: 'ev_2', type: 'validation', actor: 'worker' }),
          ]),
      },
    };
    const service = new AgentRuntimeEvidenceStoreService(prisma as never);

    const evidence = await service.list({
      workspaceId: 'ws_1',
      type: 'validation',
      actor: 'codex',
    });

    expect(evidence.map((entry) => entry.id)).toEqual(['ev_1']);
    expect(prisma.kloelMemory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'ws_1', category: 'agent_evidence', type: 'validation' },
      }),
    );
  });

  it('queries evidence across content, source, actor, and url fields', async () => {
    const prisma = {
      kloelMemory: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            makeRow({ id: 'ev_1', source: 'tool_result', content: 'checkout recovered' }),
            makeRow({ id: 'ev_2', source: 'pulse', content: 'unrelated' }),
          ]),
      },
    };
    const service = new AgentRuntimeEvidenceStoreService(prisma as never);

    const evidence = await service.query({ workspaceId: 'ws_1', keyword: 'checkout' });

    expect(evidence.map((entry) => entry.id)).toEqual(['ev_1']);
  });

  it('verifies content integrity by recomputing sha256', async () => {
    const prisma = {
      kloelMemory: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            makeRow({ id: 'ev_ok', content: 'valid' }),
            makeRow({ id: 'ev_bad', content: 'tampered', hash: sha256('old content') }),
          ]),
      },
    };
    const service = new AgentRuntimeEvidenceStoreService(prisma as never);

    const issues = await service.verify('ws_1');

    expect(issues).toEqual([
      {
        id: 'ev_bad',
        storedSha256: sha256('old content'),
        computedSha256: sha256('tampered'),
      },
    ]);
  });

  it('summarizes evidence by type, verification state, and actor', async () => {
    const prisma = {
      kloelMemory: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            makeRow({ id: 'ev_1', type: 'validation', actor: 'codex' }),
            makeRow({ id: 'ev_2', type: 'pulse', actor: 'codex', verification: 'unverified' }),
          ]),
      },
    };
    const service = new AgentRuntimeEvidenceStoreService(prisma as never);

    const summary = await service.summary('ws_1');

    expect(summary).toEqual({
      total: 2,
      byType: { validation: 1, pulse: 1 },
      byVerification: { single_source: 1, unverified: 1 },
      uniqueActors: ['codex'],
    });
  });
});
