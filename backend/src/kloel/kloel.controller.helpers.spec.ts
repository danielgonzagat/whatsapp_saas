import { BadRequestException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../common/interfaces';
import {
  KLOEL_PENDING_APPROVALS_SELECT,
  buildKloelMemoryArgs,
  buildKloelThinkPayload,
  buildRegenerateMessageArgs,
  parseListThreadsQuery,
} from './kloel.controller.helpers';

function fakeRequest(overrides: Partial<AuthenticatedRequest> = {}): AuthenticatedRequest {
  return {
    workspaceId: undefined,
    user: { sub: 'user-1', workspaceId: 'ws-jwt', email: 'a@b.com', role: 'OWNER' },
    ...overrides,
  } as never as AuthenticatedRequest;
}

describe('kloel.controller.helpers', () => {
  describe('KLOEL_PENDING_APPROVALS_SELECT', () => {
    it('exposes the exact set of approval fields exposed by the controller', () => {
      expect(KLOEL_PENDING_APPROVALS_SELECT).toEqual({
        id: true,
        kind: true,
        scope: true,
        entityType: true,
        entityId: true,
        state: true,
        title: true,
        prompt: true,
        payload: true,
        createdAt: true,
        updatedAt: true,
      });
    });

    it('is frozen so request handlers cannot leak fields by mutation', () => {
      expect(Object.isFrozen(KLOEL_PENDING_APPROVALS_SELECT)).toBe(true);
    });
  });

  describe('parseListThreadsQuery', () => {
    it('returns paginated=false when neither limit nor cursor were supplied', () => {
      expect(parseListThreadsQuery(undefined, undefined)).toEqual({ paginated: false });
    });

    it('parses numeric limit and cursor when both are provided', () => {
      expect(parseListThreadsQuery('20', '10')).toEqual({
        limit: 20,
        cursor: 10,
        paginated: true,
      });
    });

    it('omits non-finite values but still marks the request as paginated', () => {
      expect(parseListThreadsQuery('abc', undefined)).toEqual({ paginated: true });
    });

    it('keeps cursor even when limit is not finite', () => {
      expect(parseListThreadsQuery('NaN', '7')).toEqual({ cursor: 7, paginated: true });
    });
  });

  describe('buildKloelThinkPayload', () => {
    const readUserId = (user: unknown): string | undefined => {
      if (user && typeof user === 'object' && 'sub' in user) {
        const sub = (user as { sub?: unknown }).sub;
        return typeof sub === 'string' ? sub : undefined;
      }
      return undefined;
    };

    it('prefers req.workspaceId over the JWT workspace', () => {
      const result = buildKloelThinkPayload(
        { message: 'oi' },
        fakeRequest({ workspaceId: 'ws-override' }),
        readUserId,
      );
      expect(result).toEqual({
        message: 'oi',
        workspaceId: 'ws-override',
        userId: 'user-1',
      });
    });

    it('falls back to the JWT workspace when the request has none', () => {
      const result = buildKloelThinkPayload({ message: 'oi' }, fakeRequest(), readUserId);
      expect(result.workspaceId).toBe('ws-jwt');
    });

    it('omits userId and userName when missing instead of forwarding undefined keys', () => {
      const req = {
        workspaceId: 'ws-1',
        user: { sub: '', workspaceId: 'ws-1', email: 'a@b.com', role: 'OWNER' },
      } as never as AuthenticatedRequest;
      const result = buildKloelThinkPayload({ message: 'oi' }, req, () => undefined);
      expect('userId' in result).toBe(false);
      expect('userName' in result).toBe(false);
    });

    it('passes metadata through only when present in the dto', () => {
      const req = fakeRequest({
        user: {
          sub: 'user-1',
          workspaceId: 'ws-1',
          email: 'a@b.com',
          role: 'OWNER',
          name: 'Daniel',
        },
      } as never as Partial<AuthenticatedRequest>);
      const result = buildKloelThinkPayload(
        { message: 'oi', metadata: { source: 'inbox' } },
        req,
        readUserId,
      );
      expect(result).toMatchObject({
        message: 'oi',
        workspaceId: 'ws-1',
        userId: 'user-1',
        userName: 'Daniel',
        metadata: { source: 'inbox' },
      });
    });

    it('removes the metadata key entirely when the dto omits it', () => {
      const result = buildKloelThinkPayload({ message: 'oi' }, fakeRequest(), readUserId);
      expect('metadata' in result).toBe(false);
    });
  });

  describe('buildKloelMemoryArgs', () => {
    it('uses request-level workspace override before JWT', () => {
      const args = buildKloelMemoryArgs(
        { workspaceId: 'ws-body', type: 'note', content: 'oi' },
        fakeRequest({ workspaceId: 'ws-override' }),
      );
      expect(args).toEqual({
        workspaceId: 'ws-override',
        type: 'note',
        content: 'oi',
        metadata: undefined,
      });
    });

    it('keeps metadata as InputJsonValue when present', () => {
      const args = buildKloelMemoryArgs(
        {
          workspaceId: 'ws-body',
          type: 'note',
          content: 'oi',
          metadata: { reason: 'pdf' },
        },
        fakeRequest({ workspaceId: 'ws-1' }),
      );
      expect(args.metadata).toEqual({ reason: 'pdf' });
    });

    it('falls back to the JWT workspaceId when the request omits one', () => {
      const args = buildKloelMemoryArgs(
        { workspaceId: 'ws-body', type: 'note', content: 'oi' },
        fakeRequest(),
      );
      expect(args.workspaceId).toBe('ws-jwt');
    });
  });

  describe('buildRegenerateMessageArgs', () => {
    it('rejects empty or whitespace-only messageId payloads', () => {
      expect(() =>
        buildRegenerateMessageArgs('conv-1', { messageId: '  ' }, fakeRequest(), 'ws-1'),
      ).toThrow(BadRequestException);
      expect(() => buildRegenerateMessageArgs('conv-1', {}, fakeRequest(), 'ws-1')).toThrow(
        'messageId é obrigatório.',
      );
    });

    it('returns the trimmed messageId together with workspace + conversation ids', () => {
      const args = buildRegenerateMessageArgs(
        'conv-1',
        { messageId: '  msg-9  ' },
        fakeRequest(),
        'ws-1',
      );
      expect(args).toEqual({
        workspaceId: 'ws-1',
        conversationId: 'conv-1',
        assistantMessageId: 'msg-9',
        userId: 'user-1',
      });
    });

    it('forwards optional userName only when the JWT carries one', () => {
      const req = fakeRequest({
        user: {
          sub: 'user-1',
          workspaceId: 'ws-1',
          email: 'a@b.com',
          role: 'OWNER',
          name: 'Daniel',
        },
      } as never as Partial<AuthenticatedRequest>);
      const args = buildRegenerateMessageArgs('conv-1', { messageId: 'm1' }, req, 'ws-1');
      expect(args.userName).toBe('Daniel');
    });

    it('omits userId when the JWT lacks a string sub', () => {
      const req = {
        workspaceId: 'ws-1',
        user: { sub: undefined, workspaceId: 'ws-1', email: 'a@b.com', role: 'OWNER' },
      } as never as AuthenticatedRequest;
      const args = buildRegenerateMessageArgs('conv-1', { messageId: 'm1' }, req, 'ws-1');
      expect('userId' in args).toBe(false);
    });
  });
});
