import { describe, expect, it } from 'vitest';
import {
  deriveOperationalUnreadCount,
  isConversationPendingForAgent,
} from '../conversation-agent-state';

describe('conversation-agent-state', () => {
  it('treats unanswered inbound as pending even when unreadCount is zero', () => {
    const conversation = {
      status: 'OPEN',
      mode: 'AI',
      assignedAgentId: null,
      unreadCount: 0,
      messages: [
        { direction: 'INBOUND', createdAt: new Date('2026-03-21T12:10:00.000Z') },
        { direction: 'OUTBOUND', createdAt: new Date('2026-03-21T12:00:00.000Z') },
      ],
    };

    expect(isConversationPendingForAgent(conversation)).toBe(true);
    expect(deriveOperationalUnreadCount(conversation)).toBe(1);
  });

  it('does not treat an already replied conversation as pending', () => {
    const conversation = {
      status: 'OPEN',
      mode: 'AI',
      assignedAgentId: null,
      unreadCount: 0,
      messages: [
        { direction: 'OUTBOUND', createdAt: new Date('2026-03-21T12:10:00.000Z') },
        { direction: 'INBOUND', createdAt: new Date('2026-03-21T12:00:00.000Z') },
      ],
    };

    expect(isConversationPendingForAgent(conversation)).toBe(false);
    expect(deriveOperationalUnreadCount(conversation)).toBe(0);
  });
});
