import {
  mapRecentConversation,
  resolveRecentConversationStatus,
  type RecentConversationInput,
} from './dashboard.recent-conversations.helpers';

describe('resolveRecentConversationStatus', () => {
  it('returns "done" when conversation is CLOSED', () => {
    expect(
      resolveRecentConversationStatus({
        id: 'c1',
        status: 'CLOSED',
        mode: 'AI',
        unreadCount: 5,
      }),
    ).toBe('done');
  });

  it('returns "ai" when mode is AI and unreadCount is 0', () => {
    expect(
      resolveRecentConversationStatus({
        id: 'c1',
        status: 'OPEN',
        mode: 'AI',
        unreadCount: 0,
      }),
    ).toBe('ai');
  });

  it('returns "waiting" when AI mode but unread > 0', () => {
    expect(
      resolveRecentConversationStatus({
        id: 'c1',
        status: 'OPEN',
        mode: 'AI',
        unreadCount: 3,
      }),
    ).toBe('waiting');
  });

  it('returns "waiting" when mode is HUMAN', () => {
    expect(
      resolveRecentConversationStatus({
        id: 'c1',
        status: 'OPEN',
        mode: 'HUMAN',
        unreadCount: 0,
      }),
    ).toBe('waiting');
  });
});

describe('mapRecentConversation', () => {
  const baseConversation: RecentConversationInput = {
    id: 'conv-1',
    status: 'OPEN',
    mode: 'AI',
    unreadCount: 0,
    lastMessageAt: new Date('2026-05-01T12:00:00Z'),
    contact: {
      name: 'Alice',
      phone: '+5511999999999',
      avatarUrl: 'https://example.com/a.jpg',
    },
    messages: [
      {
        content: 'Hello world',
        createdAt: new Date('2026-05-01T11:00:00Z'),
        direction: 'OUTBOUND',
      },
    ],
  };

  it('maps a full conversation row to the preview shape', () => {
    expect(mapRecentConversation(baseConversation)).toEqual({
      id: 'conv-1',
      contactName: 'Alice',
      contactPhone: '+5511999999999',
      avatarUrl: 'https://example.com/a.jpg',
      preview: 'Hello world',
      lastMessageAt: '2026-05-01T11:00:00.000Z',
      status: 'ai',
      unreadCount: 0,
    });
  });

  it('falls back to phone when contact name is empty', () => {
    const result = mapRecentConversation({
      ...baseConversation,
      contact: { name: '', phone: '+5500', avatarUrl: null },
    });
    expect(result.contactName).toBe('+5500');
  });

  it('falls back to "Contato sem identificação" when name and phone are missing', () => {
    const result = mapRecentConversation({
      ...baseConversation,
      contact: { name: null, phone: null, avatarUrl: null },
    });
    expect(result.contactName).toBe('Contato sem identificação');
  });

  it('uses conversation.lastMessageAt when last message has no createdAt', () => {
    const result = mapRecentConversation({
      ...baseConversation,
      messages: [{ content: 'x', direction: 'OUTBOUND' }],
    });
    expect(result.lastMessageAt).toBe('2026-05-01T12:00:00.000Z');
  });

  it('returns null lastMessageAt when no date sources are available', () => {
    const result = mapRecentConversation({
      ...baseConversation,
      messages: [],
      lastMessageAt: null,
    });
    expect(result.lastMessageAt).toBeNull();
  });

  it('trims preview content', () => {
    const result = mapRecentConversation({
      ...baseConversation,
      messages: [{ content: '   padded   ', createdAt: new Date(), direction: 'OUTBOUND' }],
    });
    expect(result.preview).toBe('padded');
  });

  it('returns empty preview when last message content is null/undefined', () => {
    const result = mapRecentConversation({
      ...baseConversation,
      messages: [{ content: null, createdAt: new Date(), direction: 'OUTBOUND' }],
    });
    expect(result.preview).toBe('');
  });

  it('reflects CLOSED status as "done" regardless of mode', () => {
    const result = mapRecentConversation({
      ...baseConversation,
      status: 'CLOSED',
      mode: 'HUMAN',
      unreadCount: 7,
    });
    expect(result.status).toBe('done');
  });
});
