import {
  buildHumanTaskApprovalMessage,
  buildHumanTaskMetadataUpdate,
  buildHumanTaskRejectionMessage,
  buildRejectedHumanTaskValue,
  buildResolvedHumanTaskValue,
  isActiveHumanTask,
  mapHumanTaskListItem,
  matchHumanTaskCandidate,
} from './cia.service.helpers';

describe('cia.service.helpers (human-task)', () => {
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
      const out = buildResolvedHumanTaskValue({ id: 't-1' }, '', '2026-04-17T00:00:00.000Z');
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
      expect(buildHumanTaskMetadataUpdate(null, 'RESOLVED', '2026-04-17T00:00:00.000Z')).toEqual({
        status: 'RESOLVED',
        resolvedAt: '2026-04-17T00:00:00.000Z',
      });
      expect(buildHumanTaskMetadataUpdate([1, 2], 'RESOLVED', '2026-04-17T00:00:00.000Z')).toEqual({
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
      expect(buildHumanTaskRejectionMessage('5511')).toBe('Exceção humana dispensada para 5511.');
    });

    it('falls back to "o contato" when phone is empty', () => {
      expect(buildHumanTaskRejectionMessage('')).toBe('Exceção humana dispensada para o contato.');
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
      expect(matchHumanTaskCandidate({ ...candidate, value: 'broken' }, 'task-abc')).toBe(false);
      expect(matchHumanTaskCandidate({ ...candidate, value: null }, 'task-abc')).toBe(false);
    });
  });
});
