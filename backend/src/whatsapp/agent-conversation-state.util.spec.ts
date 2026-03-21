import { buildConversationOperationalState } from './agent-conversation-state.util';

describe('buildConversationOperationalState', () => {
  it('marks a conversation as pending when the latest unanswered message is inbound even with unreadCount=0', () => {
    const state = buildConversationOperationalState({
      id: 'conv-1',
      status: 'OPEN',
      mode: 'AI',
      assignedAgentId: null,
      unreadCount: 0,
      messages: [
        {
          id: 'msg-2',
          direction: 'INBOUND',
          createdAt: new Date('2026-03-21T12:10:00.000Z'),
          content: 'Oi, preciso de ajuda',
        },
        {
          id: 'msg-1',
          direction: 'OUTBOUND',
          createdAt: new Date('2026-03-21T12:00:00.000Z'),
          content: 'Olá!',
        },
      ],
      contact: {
        id: 'contact-1',
        phone: '5511999999999',
        name: 'Alice',
      },
    });

    expect(state.pending).toBe(true);
    expect(state.needsReply).toBe(true);
    expect(state.pendingMessages).toBe(1);
    expect(state.blockedReason).toBeNull();
  });

  it('marks a conversation as already replied when the latest outbound is newer than the last inbound', () => {
    const state = buildConversationOperationalState({
      id: 'conv-2',
      status: 'OPEN',
      mode: 'AI',
      assignedAgentId: null,
      unreadCount: 0,
      messages: [
        {
          id: 'msg-2',
          direction: 'OUTBOUND',
          createdAt: new Date('2026-03-21T12:10:00.000Z'),
          content: 'Tudo certo',
        },
        {
          id: 'msg-1',
          direction: 'INBOUND',
          createdAt: new Date('2026-03-21T12:00:00.000Z'),
          content: 'Oi',
        },
      ],
      contact: {
        id: 'contact-2',
        phone: '5511888888888',
        name: 'Bruno',
      },
    });

    expect(state.pending).toBe(false);
    expect(state.blockedReason).toBe('already_replied');
  });
});
