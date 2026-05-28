import {
  buildChannelSubtitle,
  buildHumanTaskApprovalMessage,
  buildHumanTaskMetadataUpdate,
  buildHumanTaskRejectionMessage,
  buildNowEvent,
  buildRejectedHumanTaskValue,
  buildResolvedHumanTaskValue,
  collectActiveChannels,
  isActiveHumanTask,
  mapAccountProofRecord,
  mapConversationProofRecord,
  mapCycleProofRecord,
  mapHumanTaskListItem,
  mapMindLift,
  matchHumanTaskCandidate,
  readRecord,
  readText,
  serializeCognitiveHighlight,
} from './cia.service.helpers';

describe('cia.service.helpers', () => {
  describe('readRecord', () => {
    it('returns the same record for an object value', () => {
      const input = { a: 1, b: 'x' };
      expect(readRecord(input)).toBe(input);
    });

    it('returns {} for string / null / array / number / undefined', () => {
      expect(readRecord('foo')).toEqual({});
      expect(readRecord(null)).toEqual({});
      expect(readRecord([1, 2])).toEqual({});
      expect(readRecord(42)).toEqual({});
      expect(readRecord(undefined)).toEqual({});
    });
  });

  describe('readText', () => {
    it('returns the same string for a string value', () => {
      expect(readText('hello')).toBe('hello');
    });

    it('returns "" for non-string values', () => {
      expect(readText(123)).toBe('');
      expect(readText(null)).toBe('');
      expect(readText(undefined)).toBe('');
      expect(readText({ a: 1 })).toBe('');
      expect(readText([])).toBe('');
    });
  });

  describe('collectActiveChannels', () => {
    it('returns [] when no connections / integrations', () => {
      expect(collectActiveChannels(null, [])).toEqual([]);
      expect(collectActiveChannels([], [])).toEqual([]);
    });

    it('extracts whatsapp from MetaConnection.whatsappPhoneNumberId', () => {
      expect(
        collectActiveChannels(
          [{ whatsappPhoneNumberId: '5511', instagramAccountId: null, pageId: null }],
          [],
        ),
      ).toEqual(['whatsapp']);
    });

    it('extracts instagram from MetaConnection.instagramAccountId', () => {
      expect(
        collectActiveChannels(
          [{ whatsappPhoneNumberId: null, instagramAccountId: 'ig-1', pageId: null }],
          [],
        ),
      ).toEqual(['instagram']);
    });

    it('extracts facebook from MetaConnection.pageId', () => {
      expect(
        collectActiveChannels(
          [{ whatsappPhoneNumberId: null, instagramAccountId: null, pageId: 'fb-1' }],
          [],
        ),
      ).toEqual(['facebook']);
    });

    it('extracts instagram from integration type (case-insensitive)', () => {
      expect(collectActiveChannels([], [{ type: 'INSTAGRAM' }])).toEqual(['instagram']);
      expect(collectActiveChannels([], [{ type: 'instagram' }])).toEqual(['instagram']);
    });

    it('deduplicates channels across sources', () => {
      const channels = collectActiveChannels(
        [{ whatsappPhoneNumberId: '5511', instagramAccountId: 'ig-1', pageId: null }],
        [{ type: 'INSTAGRAM' }, { type: 'STRIPE' }],
      );
      expect(channels.sort()).toEqual(['instagram', 'whatsapp']);
    });

    it('ignores irrelevant integration types', () => {
      expect(collectActiveChannels([], [{ type: 'STRIPE' }, { type: 'ASAAS' }])).toEqual([]);
    });
  });

  describe('buildChannelSubtitle', () => {
    it('returns neutral copy when no channels are active', () => {
      expect(buildChannelSubtitle([])).toBe('Cuidando do seu negócio');
    });

    it('returns single-channel copy mapped via CHANNEL_LABEL', () => {
      expect(buildChannelSubtitle(['whatsapp'])).toBe('Cuidando do seu negócio no WhatsApp');
      expect(buildChannelSubtitle(['instagram'])).toBe('Cuidando do seu negócio no Instagram');
      expect(buildChannelSubtitle(['facebook'])).toBe('Cuidando do seu negócio no Facebook');
    });

    it('falls back to the raw channel name when not in CHANNEL_LABEL', () => {
      expect(buildChannelSubtitle(['unknown'])).toBe('Cuidando do seu negócio no unknown');
    });

    it('returns omnichannel copy for multiple channels', () => {
      expect(buildChannelSubtitle(['whatsapp', 'instagram'])).toBe(
        'Orquestrando seus canais de venda',
      );
    });
  });

  describe('mapMindLift', () => {
    it('returns null for nullish input', () => {
      expect(mapMindLift(null)).toBeNull();
      expect(mapMindLift(undefined)).toBeNull();
    });

    it('projects the MIND lift into the surface contract', () => {
      expect(
        mapMindLift({ n: 10, mindMean: 0.7, baselineMean: 0.5, lift: 0.4, pZScore: 1.5 }),
      ).toEqual({
        decisionType: 'followup_timing',
        n: 10,
        mindMean: 0.7,
        baselineMean: 0.5,
        lift: 0.4,
        pZScore: 1.5,
      });
    });
  });

  describe('mapAccountProofRecord', () => {
    const baseRecord = {
      id: 'ap-1',
      proofType: 'CANONICAL',
      status: 'READY',
      cycleProofId: 'cycle-1',
      noLegalActions: false,
      candidateCount: 5,
      eligibleActionCount: 4,
      blockedActionCount: 1,
      deferredActionCount: 0,
      waitingApprovalCount: 0,
      waitingInputCount: 0,
      silentRemainderCount: 0,
      workItemUniverse: [{ id: 'w-1' }],
      actionUniverse: [{ id: 'a-1' }],
      executedActions: [],
      blockedActions: [],
      deferredActions: [],
      metadata: { summary: 'ok', guaranteeReport: { passed: true } },
      createdAt: new Date('2026-04-17T00:00:00.000Z'),
    };

    it('projects the record with canonical=true', () => {
      const out = mapAccountProofRecord(baseRecord);
      expect(out.id).toBe('ap-1');
      expect(out.canonical).toBe(true);
      expect(out.summary).toBe('ok');
      expect(out.guaranteeReport).toEqual({ passed: true });
      expect(out.workItemUniverse).toEqual([{ id: 'w-1' }]);
      expect(out.generatedAt).toBe(baseRecord.createdAt);
    });

    it('coerces null counts to 0 and null arrays to []', () => {
      const out = mapAccountProofRecord({
        ...baseRecord,
        candidateCount: null,
        workItemUniverse: null,
        actionUniverse: null,
        executedActions: null,
        blockedActions: null,
        deferredActions: null,
        metadata: null,
      });
      expect(out.candidateCount).toBe(0);
      expect(out.workItemUniverse).toEqual([]);
      expect(out.summary).toBeNull();
      expect(out.guaranteeReport).toBeNull();
    });
  });

  describe('mapConversationProofRecord', () => {
    it('projects the record with canonical=true', () => {
      const record = {
        id: 'cp-1',
        conversationId: 'conv-1',
        contactId: null,
        phone: '5511',
        status: 'READY',
        cycleProofId: null,
        accountProofId: null,
        selectedActionType: 'reply',
        selectedTactic: null,
        governor: null,
        renderedMessage: 'hi',
        outcome: null,
        actionUniverse: [],
        tacticUniverse: [],
        selectedAction: null,
        selectedTacticData: null,
        metadata: null,
        createdAt: new Date('2026-04-17T00:00:00.000Z'),
      };
      const out = mapConversationProofRecord(record);
      expect(out.canonical).toBe(true);
      expect(out.conversationId).toBe('conv-1');
      expect(out.phone).toBe('5511');
      expect(out.actionUniverse).toEqual([]);
    });
  });

  describe('mapCycleProofRecord', () => {
    it('prefers value.summary, falls back to content', () => {
      const out = mapCycleProofRecord({
        id: 'k-1',
        key: 'cia_cycle_proof:current',
        type: 'cycle_proof',
        value: { summary: 'from-value', cycleProofId: 'cp-1' },
        metadata: {},
        content: 'fallback',
        createdAt: new Date('2026-04-17T00:00:00.000Z'),
      });
      expect(out.summary).toBe('from-value');
      expect(out.cycleProofId).toBe('cp-1');
    });

    it('falls back to content when value has no summary', () => {
      const out = mapCycleProofRecord({
        id: 'k-1',
        key: 'cia_cycle_proof:current',
        type: 'cycle_proof',
        value: {},
        metadata: { cycleProofId: 'cp-meta' },
        content: 'fallback-summary',
        createdAt: new Date('2026-04-17T00:00:00.000Z'),
      });
      expect(out.summary).toBe('fallback-summary');
      expect(out.cycleProofId).toBe('cp-meta');
    });
  });

  describe('serializeCognitiveHighlight', () => {
    it('serializes a kloelMemory cognitive row', () => {
      const item = {
        id: 'm-1',
        key: 'k-1',
        value: {
          contactId: 'c-1',
          summary: 'fired',
          nextBestAction: 'follow_up',
          classificationConfidence: 0.83,
        },
        category: 'cognitive_state',
        type: 'classification',
        content: null,
        metadata: { phone: '5511' },
        createdAt: new Date('2026-04-17T00:00:00.000Z'),
      };
      const out = serializeCognitiveHighlight(item);
      expect(out.id).toBe('m-1');
      expect(out.contactId).toBe('c-1');
      expect(out.phone).toBe('5511');
      expect(out.summary).toBe('fired');
      expect(out.nextBestAction).toBe('follow_up');
      expect(out.confidence).toBe(0.83);
    });

    it('uses default summary when value/content are empty', () => {
      const out = serializeCognitiveHighlight({
        id: 'm-1',
        key: 'k-1',
        value: {},
        category: 'cognitive_state',
        type: null,
        content: null,
        metadata: null,
        createdAt: new Date('2026-04-17T00:00:00.000Z'),
      });
      expect(out.summary).toBe('Sinal cognitivo disponível.');
      expect(out.contactId).toBeNull();
    });
  });

  describe('buildNowEvent', () => {
    it('returns null when there is no latest event', () => {
      expect(buildNowEvent(null)).toBeNull();
    });

    it('projects an event into the surface shape', () => {
      const event = {
        message: 'sent',
        phase: 'reply',
        type: 'status',
        ts: 1700000000,
      };
      expect(buildNowEvent(event)).toEqual({
        message: 'sent',
        phase: 'reply',
        type: 'status',
        ts: 1700000000,
      });
    });

    it('falls back to null phase when undefined', () => {
      const event = {
        message: 'sent',
        type: 'status',
        ts: 1700000000,
      };
      expect(buildNowEvent(event)).toEqual({
        message: 'sent',
        phase: null,
        type: 'status',
        ts: 1700000000,
      });
    });
  });

  describe('mapHumanTaskListItem', () => {
    it('projects a well-formed task', () => {
      const out = mapHumanTaskListItem({
        id: 'mem-1',
        workspaceId: 'ws-1',
        category: 'human_task',
        key: 'task-1',
        value: { id: 'task-1', phone: '5511', status: 'OPEN' },
        createdAt: new Date('2026-04-17T00:00:00.000Z'),
      });
      expect(out).toEqual({
        memoryId: 'mem-1',
        key: 'task-1',
        id: 'task-1',
        phone: '5511',
        status: 'OPEN',
      });
    });

    it('defaults status to OPEN when missing', () => {
      const out = mapHumanTaskListItem({
        id: 'mem-2',
        workspaceId: 'ws-1',
        category: 'human_task',
        key: 'task-2',
        value: { id: 'task-2' },
        createdAt: new Date('2026-04-17T00:00:00.000Z'),
      });
      expect(out.status).toBe('OPEN');
    });

    it('does not spread malformed string payloads into char-indexed keys', () => {
      const out = mapHumanTaskListItem({
        id: 'mem-3',
        workspaceId: 'ws-1',
        category: 'human_task',
        key: 'task-3',
        value: 'broken-string-payload',
        createdAt: new Date('2026-04-17T00:00:00.000Z'),
      });
      expect(out).toEqual({
        memoryId: 'mem-3',
        key: 'task-3',
        status: 'OPEN',
      });
      expect(out).not.toHaveProperty('0');
      expect(out).not.toHaveProperty('1');
    });
  });

  describe('isActiveHumanTask', () => {
    it('returns true for OPEN / PENDING / arbitrary non-final statuses', () => {
      expect(isActiveHumanTask({ status: 'OPEN' })).toBe(true);
      expect(isActiveHumanTask({ status: 'PENDING' })).toBe(true);
      expect(isActiveHumanTask({ status: 'WAITING' })).toBe(true);
    });

    it('returns false for RESOLVED / REJECTED', () => {
      expect(isActiveHumanTask({ status: 'RESOLVED' })).toBe(false);
      expect(isActiveHumanTask({ status: 'REJECTED' })).toBe(false);
    });
  });

  describe('buildResolvedHumanTaskValue', () => {
    it('merges status RESOLVED + resolvedAt + approvedReply into the task', () => {
      const out = buildResolvedHumanTaskValue(
        { id: 't-1', phone: '5511', status: 'OPEN' },
        'ok',
        '2026-04-17T00:00:00.000Z',
      );
      expect(out).toEqual({
        id: 't-1',
        phone: '5511',
        status: 'RESOLVED',
        resolvedAt: '2026-04-17T00:00:00.000Z',
        approvedReply: 'ok',
      });
    });

    it('writes approvedReply=null when empty', () => {
      const out = buildResolvedHumanTaskValue(
        { id: 't-1' },
        '',
        '2026-04-17T00:00:00.000Z',
      );
      expect(out.approvedReply).toBeNull();
    });
  });

  describe('buildRejectedHumanTaskValue', () => {
    it('merges status REJECTED + resolvedAt into the task', () => {
      const out = buildRejectedHumanTaskValue(
        { id: 't-1', phone: '5511', status: 'OPEN' },
        '2026-04-17T00:00:00.000Z',
      );
      expect(out).toEqual({
        id: 't-1',
        phone: '5511',
        status: 'REJECTED',
        resolvedAt: '2026-04-17T00:00:00.000Z',
      });
    });
  });

  describe('buildHumanTaskMetadataUpdate', () => {
    it('preserves prior metadata and stamps status + resolvedAt', () => {
      expect(
        buildHumanTaskMetadataUpdate({ origin: 'cia' }, 'RESOLVED', '2026-04-17T00:00:00.000Z'),
      ).toEqual({
        origin: 'cia',
        status: 'RESOLVED',
        resolvedAt: '2026-04-17T00:00:00.000Z',
      });
    });

    it('normalizes malformed metadata (string) before stamping', () => {
      const out = buildHumanTaskMetadataUpdate(
        'broken-string-metadata',
        'REJECTED',
        '2026-04-17T00:00:00.000Z',
      );
      expect(out).toEqual({
        status: 'REJECTED',
        resolvedAt: '2026-04-17T00:00:00.000Z',
      });
      expect(out).not.toHaveProperty('0');
    });

    it('normalizes null / array metadata to empty record', () => {
      expect(
        buildHumanTaskMetadataUpdate(null, 'RESOLVED', '2026-04-17T00:00:00.000Z'),
      ).toEqual({
        status: 'RESOLVED',
        resolvedAt: '2026-04-17T00:00:00.000Z',
      });
      expect(
        buildHumanTaskMetadataUpdate([1, 2], 'RESOLVED', '2026-04-17T00:00:00.000Z'),
      ).toEqual({
        status: 'RESOLVED',
        resolvedAt: '2026-04-17T00:00:00.000Z',
      });
    });
  });

  describe('buildHumanTaskApprovalMessage', () => {
    it('formats reply-sent message when approvedReply is present', () => {
      expect(buildHumanTaskApprovalMessage('hello', '5511', 'conv-1')).toBe(
        'Validação concluída. Enviei a resposta aprovada para 5511.',
      );
    });

    it('falls back to "o contato" when phone is empty', () => {
      expect(buildHumanTaskApprovalMessage('hello', '', 'conv-1')).toBe(
        'Validação concluída. Enviei a resposta aprovada para o contato.',
      );
    });

    it('formats resume-only message when approvedReply is empty', () => {
      expect(buildHumanTaskApprovalMessage('', '5511', 'conv-1')).toBe(
        'Validação concluída. Retomei a autonomia da conversa conv-1.',
      );
    });
  });

  describe('buildHumanTaskRejectionMessage', () => {
    it('formats with phone when present', () => {
      expect(buildHumanTaskRejectionMessage('5511')).toBe(
        'Exceção humana dispensada para 5511.',
      );
    });

    it('falls back to "o contato" when phone is empty', () => {
      expect(buildHumanTaskRejectionMessage('')).toBe(
        'Exceção humana dispensada para o contato.',
      );
    });
  });

  describe('matchHumanTaskCandidate', () => {
    const candidate = {
      id: 'mem-1',
      key: 'task-1',
      value: { id: 'task-abc', status: 'OPEN' },
      createdAt: new Date('2026-04-17T00:00:00.000Z'),
    };

    it('returns true when value.id matches the supplied taskId', () => {
      expect(matchHumanTaskCandidate(candidate, 'task-abc')).toBe(true);
    });

    it('returns false when value.id differs from the supplied taskId', () => {
      expect(matchHumanTaskCandidate(candidate, 'task-xyz')).toBe(false);
    });

    it('returns false when value is malformed (no string id)', () => {
      expect(
        matchHumanTaskCandidate(
          { ...candidate, value: 'broken' },
          'task-abc',
        ),
      ).toBe(false);
      expect(
        matchHumanTaskCandidate({ ...candidate, value: null }, 'task-abc'),
      ).toBe(false);
    });
  });
});
