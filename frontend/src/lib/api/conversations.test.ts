import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listConversations,
  listInboxAgents,
  getConversationMessages,
  closeConversation,
  assignConversation,
  Conversation,
  InboxAgent,
  Message,
} from './conversations';

const { apiFetch } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}));

vi.mock('./core', () => ({
  apiFetch,
}));

vi.mock('swr', () => ({
  mutate: vi.fn(),
}));

const baseConversation: Conversation = {
  id: 'conv1',
  contactId: 'ct1',
  status: 'ai',
  channel: 'whatsapp',
  lastMessageAt: '2026-01-01T00:00:00Z',
  unreadCount: 0,
  contact: { id: 'ct1', name: 'Alice', phone: '+5511999999999' },
  assignedAgent: { id: 'ag1', name: 'Bot' },
  lastMessageStatus: 'read',
  lastMessageErrorCode: null,
};

const baseAgent: InboxAgent = {
  id: 'ag1',
  name: 'Bot',
  email: 'bot@kloel.com',
  role: 'ai',
  isOnline: true,
};

const baseMessage: Message = {
  id: 'msg1',
  content: 'Hello!',
  direction: 'OUTBOUND',
  type: 'text',
  status: 'read',
  mediaUrl: null,
  createdAt: '2026-01-01T00:00:00Z',
};

describe('listConversations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns conversations on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: [baseConversation], status: 200 });

    const result = await listConversations('ws1');
    expect(result).toEqual([baseConversation]);
    expect(apiFetch).toHaveBeenCalledWith('/inbox/ws1/conversations');
  });

  it('returns empty array when data is nullish', async () => {
    apiFetch.mockResolvedValueOnce({ data: undefined, status: 200 });

    const result = await listConversations('ws1');
    expect(result).toEqual([]);
  });

  it('encodes workspace id', async () => {
    apiFetch.mockResolvedValueOnce({ data: [], status: 200 });

    await listConversations('ws 1');
    expect(apiFetch).toHaveBeenCalledWith('/inbox/ws%201/conversations');
  });

  it('throws on error', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Forbidden', status: 403 });

    await expect(listConversations('ws1')).rejects.toThrow('Forbidden');
  });
});

describe('listInboxAgents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns agents on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: [baseAgent], status: 200 });

    const result = await listInboxAgents('ws1');
    expect(result).toEqual([baseAgent]);
    expect(apiFetch).toHaveBeenCalledWith('/inbox/ws1/agents');
  });

  it('returns empty array when data is nullish', async () => {
    apiFetch.mockResolvedValueOnce({ data: null, status: 200 });

    const result = await listInboxAgents('ws1');
    expect(result).toEqual([]);
  });

  it('throws on error', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Unauthorized', status: 401 });

    await expect(listInboxAgents('ws1')).rejects.toThrow('Unauthorized');
  });
});

describe('getConversationMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns messages on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: [baseMessage], status: 200 });

    const result = await getConversationMessages('conv1');
    expect(result).toEqual([baseMessage]);
    expect(apiFetch).toHaveBeenCalledWith('/inbox/conversations/conv1/messages');
  });

  it('returns empty array when data is nullish', async () => {
    apiFetch.mockResolvedValueOnce({ data: undefined, status: 200 });

    const result = await getConversationMessages('conv1');
    expect(result).toEqual([]);
  });

  it('throws on error', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Not Found', status: 404 });

    await expect(getConversationMessages('missing')).rejects.toThrow('Not Found');
  });
});

describe('closeConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends POST and returns data on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: { ok: true }, status: 200 });

    const result = await closeConversation('conv1');
    expect(result).toEqual({ ok: true });
    expect(apiFetch).toHaveBeenCalledWith(
      '/inbox/conversations/conv1/close',
      { method: 'POST' },
    );
  });

  it('throws on error', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Conflict', status: 409 });

    await expect(closeConversation('conv1')).rejects.toThrow('Conflict');
  });
});

describe('assignConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends POST with agentId body on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: { ok: true }, status: 200 });

    const result = await assignConversation('conv1', 'ag1');
    expect(result).toEqual({ ok: true });
    expect(apiFetch).toHaveBeenCalledWith(
      '/inbox/conversations/conv1/assign',
      { method: 'POST', body: { agentId: 'ag1' } },
    );
  });

  it('throws on error', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Bad Request', status: 400 });

    await expect(assignConversation('conv1', 'invalid')).rejects.toThrow('Bad Request');
  });
});
