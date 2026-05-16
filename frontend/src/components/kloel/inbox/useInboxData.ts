import {
  type Conversation,
  type InboxAgent,
  type Message,
  apiFetch,
  assignConversation,
  closeConversation,
  getConversationMessages,
  listConversations,
  listInboxAgents,
} from '@/lib/api';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mutate } from 'swr';
import {
  type ChannelFilter,
  INBOX_DIGIT_RE as D_RE,
  INBOX_SOURCE_LABELS,
  type StatusFilter,
  extractErrorMessage,
} from './inbox-workspace-utils';

interface UseInboxDataParams {
  workspaceId: string | undefined;
  isAuthenticated: boolean;
  isLoading: boolean;
  userId: string;
}

/** Inbox data. */
export function useInboxData({
  workspaceId,
  isAuthenticated,
  isLoading,
  userId,
}: UseInboxDataParams) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  const [agents, setAgents] = useState<InboxAgent[]>([]);
  const [assigning, setAssigning] = useState(false);

  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');

  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const requestedConversationId = searchParams?.get('conversationId');
  const requestedPhone = searchParams?.get('phone');
  const source = searchParams?.get('source') || '';
  const requestedDraft = searchParams?.get('draft');

  const sourceLabel = useMemo(() => INBOX_SOURCE_LABELS[source] || '', [source]);

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.id === selectedConversationId) || null,
    [conversations, selectedConversationId],
  );

  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      if (channelFilter !== 'all') {
        const ch = (c.channel || 'whatsapp').toLowerCase();
        if (ch !== channelFilter) {
          return false;
        }
      }
      if (statusFilter !== 'all') {
        const st = (c.status || 'open').toLowerCase();
        if (statusFilter === 'open' && st !== 'open') {
          return false;
        }
        if (statusFilter === 'closed' && st !== 'closed') {
          return false;
        }
      }
      return true;
    });
  }, [conversations, channelFilter, statusFilter]);

  const matchedConversationByPhone = useMemo(() => {
    const normalize = (value?: string | null) => (value || '').replace(D_RE, '');
    if (!requestedPhone) {
      return null;
    }
    const target = normalize(requestedPhone);
    if (!target) {
      return null;
    }
    return (
      conversations.find((conversation) =>
        normalize(conversation.contact?.phone).includes(target),
      ) || null
    );
  }, [conversations, requestedPhone]);

  const visualReady =
    !isLoading && !loadingConversations && (!selectedConversationId || !loadingMessages);

  const refreshConversations = useCallback(async () => {
    if (!workspaceId) {
      return;
    }
    setError(null);
    setLoadingConversations(true);
    try {
      const data = await listConversations(workspaceId);
      const next = Array.isArray(data) ? data : [];
      setConversations(next);
      if (requestedConversationId) {
        setSelectedConversationId(requestedConversationId);
      } else if (requestedPhone) {
        const normalize = (value?: string | null) => (value || '').replace(D_RE, '');
        const target = normalize(requestedPhone);
        const matched = next.find((conversation) =>
          normalize(conversation.contact?.phone).includes(target),
        );
        if (matched?.id) {
          setSelectedConversationId(matched.id);
        }
      } else if (!selectedConversationId && next[0]?.id) {
        setSelectedConversationId(next[0].id);
      }
    } catch (e: unknown) {
      setError(extractErrorMessage(e, 'Falha ao carregar conversas'));
    } finally {
      setLoadingConversations(false);
    }
  }, [requestedConversationId, requestedPhone, selectedConversationId, workspaceId]);

  const refreshAgents = useCallback(async () => {
    if (!workspaceId) {
      return;
    }
    try {
      const data = await listInboxAgents(workspaceId);
      setAgents(Array.isArray(data) ? data : []);
    } catch {
      setAgents([]);
    }
  }, [workspaceId]);

  const loadMessages = useCallback(async (conversationId: string) => {
    setError(null);
    setLoadingMessages(true);
    try {
      const data = await getConversationMessages(conversationId);
      setMessages(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      setError(extractErrorMessage(e, 'Falha ao carregar mensagens'));
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  const handleAssumir = async () => {
    if (!selectedConversationId || !userId) {
      return;
    }
    setAssigning(true);
    setError(null);
    try {
      await assignConversation(selectedConversationId, userId);
      await refreshConversations();
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Falha ao assumir conversa'));
    } finally {
      setAssigning(false);
    }
  };

  const handleDevolverIA = async () => {
    if (!selectedConversationId) {
      return;
    }
    setAssigning(true);
    setError(null);
    try {
      await assignConversation(selectedConversationId, '');
      await refreshConversations();
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Falha ao devolver para IA'));
    } finally {
      setAssigning(false);
    }
  };

  const handleSendReply = async () => {
    if (!selectedConversationId || !replyText.trim()) {
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/inbox/conversations/${encodeURIComponent(selectedConversationId)}/reply`,
        {
          method: 'POST',
          body: { content: replyText.trim() },
        },
      );
      if (res.error) {
        throw new Error(res.error);
      }
      setReplyText('');
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/inbox'));
      await loadMessages(selectedConversationId);
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Falha ao enviar mensagem'));
    } finally {
      setSending(false);
    }
  };

  const handleAssignAgent = async (agentId: string) => {
    if (!selectedConversationId) {
      return;
    }
    setAssigning(true);
    setError(null);
    try {
      await assignConversation(selectedConversationId, agentId);
      await refreshConversations();
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Falha ao atribuir agente'));
    } finally {
      setAssigning(false);
    }
  };

  const handleSelectConversation = async (conversationId: string) => {
    setSelectedConversationId(conversationId);
    await loadMessages(conversationId);
    await refreshConversations();
  };

  const handleCloseConversation = async () => {
    if (!selectedConversationId) {
      return;
    }
    setError(null);
    try {
      await closeConversation(selectedConversationId);
      await refreshConversations();
    } catch (e: unknown) {
      setError(extractErrorMessage(e, 'Falha ao fechar conversa'));
    }
  };

  const refreshConversationsRef = useRef(refreshConversations);
  const refreshAgentsRef = useRef(refreshAgents);
  const loadMessagesRef = useRef(loadMessages);
  useEffect(() => {
    refreshConversationsRef.current = refreshConversations;
    refreshAgentsRef.current = refreshAgents;
    loadMessagesRef.current = loadMessages;
  }, [loadMessages, refreshAgents, refreshConversations]);

  useEffect(() => {
    if (!isLoading && isAuthenticated && workspaceId) {
      refreshConversationsRef.current();
      refreshAgentsRef.current();
    }
  }, [isLoading, isAuthenticated, workspaceId]);

  useEffect(() => {
    if (!selectedConversationId) {
      return;
    }
    loadMessagesRef.current(selectedConversationId);
  }, [selectedConversationId]);

  useEffect(() => {
    if (requestedDraft && !replyText) {
      setReplyText(requestedDraft);
    }
  }, [requestedDraft, replyText]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  return {
    loadingConversations,
    loadingMessages,
    error,
    conversations,
    selectedConversationId,
    messages,
    setMessages,
    agents,
    assigning,
    channelFilter,
    setChannelFilter,
    statusFilter,
    setStatusFilter,
    replyText,
    setReplyText,
    sending,
    messagesEndRef,
    sourceLabel,
    selectedConversation,
    filteredConversations,
    matchedConversationByPhone,
    visualReady,
    handleAssumir,
    handleDevolverIA,
    handleSendReply,
    handleAssignAgent,
    refreshConversations,
    handleSelectConversation,
    handleCloseConversation,
    source,
    requestedPhone,
    requestedConversationId,
    requestedDraft,
    router,
  };
}
