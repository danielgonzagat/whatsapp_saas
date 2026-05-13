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
  parentId?: string | null;
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
      parentId: params.parentId ?? null,
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

  it('carries parentId through add and record round-trip', async () => {
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
      kloelMemory: { create: createEvidence },
    };
    const service = new AgentRuntimeEvidenceStoreService(prisma as never);

    const record = await service.add({
      workspaceId: 'ws_1',
      type: 'manual',
      source: 'test',
      content: 'chain link entry',
      parentId: 'ev_parent_1',
      actor: 'reviewer',
    });

    expect(record.parentId).toBe('ev_parent_1');
    const createArg = createEvidence.mock.calls[0]?.[0];
    expect(createArg?.data.metadata).toMatchObject({ parentId: 'ev_parent_1' });
  });

  it('exports evidence as markdown with structured sections', async () => {
    const prisma = {
      kloelMemory: {
        findMany: jest.fn().mockResolvedValue([
          makeRow({
            id: 'ev_1',
            type: 'validation',
            source: 'jest',
            content: 'all checks passed',
            actor: 'codex',
            parentId: null,
          }),
          makeRow({
            id: 'ev_2',
            type: 'pulse',
            source: 'pulse-auditor',
            content: 'integrity verified',
            actor: 'worker',
            parentId: 'ev_1',
          }),
        ]),
      },
    };
    const service = new AgentRuntimeEvidenceStoreService(prisma as never);

    const markdown = await service.exportMarkdown('ws_1', 10);

    expect(markdown).toContain('# Agent Evidence Export');
    expect(markdown).toContain('`ws_1`');
    expect(markdown).toContain('**Records:** 2');
    expect(markdown).toContain('## Evidence `ev_1`');
    expect(markdown).toContain('- **Type:** validation');
    expect(markdown).toContain('all checks passed');
    expect(markdown).toContain('## Evidence `ev_2`');
    expect(markdown).toContain('- **Parent:** `ev_1`');
    expect(markdown).toContain('integrity verified');
    expect(markdown).toContain('- **SHA256:**');
  });

  it('exportMarkdown handles empty workspace gracefully', async () => {
    const prisma = {
      kloelMemory: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new AgentRuntimeEvidenceStoreService(prisma as never);

    const markdown = await service.exportMarkdown('ws_empty', 10);

    expect(markdown).toContain('_No evidence records found._');
    expect(markdown).toContain('ws_empty');
  });

  it('traces chain-of-custody from leaf back through parentId links', async () => {
    const findMany = jest
      .fn()
      .mockImplementationOnce(() =>
        Promise.resolve([
          makeRow({ id: 'ev_3', type: 'manual', content: 'leaf evidence', parentId: 'ev_2' }),
        ]),
      )
      .mockImplementationOnce(() =>
        Promise.resolve([
          makeRow({ id: 'ev_2', type: 'validation', content: 'middle link', parentId: 'ev_1' }),
        ]),
      )
      .mockImplementationOnce(() =>
        Promise.resolve([
          makeRow({ id: 'ev_1', type: 'tool_result', content: 'root evidence', parentId: null }),
        ]),
      );
    const prisma = {
      kloelMemory: { findMany },
    };
    const service = new AgentRuntimeEvidenceStoreService(prisma as never);

    const chain = await service.custody('ws_1', 'ev_3');

    expect(chain).toHaveLength(3);
    expect(chain.map((entry) => entry.id)).toEqual(['ev_3', 'ev_2', 'ev_1']);
    expect(chain[0].content).toBe('leaf evidence');
    expect(chain[2].content).toBe('root evidence');
    expect(chain[2].parentId).toBeNull();
  });

  it('custody returns empty array when evidence not found', async () => {
    const prisma = {
      kloelMemory: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new AgentRuntimeEvidenceStoreService(prisma as never);

    const chain = await service.custody('ws_1', 'nonexistent');

    expect(chain).toEqual([]);
  });
});
