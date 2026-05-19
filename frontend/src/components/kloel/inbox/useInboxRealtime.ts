import { type Message } from '@/lib/api';
import { type Dispatch, type SetStateAction, useEffect, useRef } from 'react';
import { parseInboxMessagePayload } from './inbox-workspace-utils';

interface UseInboxRealtimeParams {
  workspaceId: string | undefined;
  isConnected: boolean;
  subscribe: (event: string, handler: (payload: Record<string, unknown>) => void) => () => void;
  selectedConversationId: string | null;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  refreshConversations: () => Promise<void>;
}

/** Inbox realtime. */
export function useInboxRealtime({
  workspaceId,
  isConnected,
  subscribe,
  selectedConversationId,
  setMessages,
  refreshConversations,
}: UseInboxRealtimeParams) {
  const selectedIdRef = useRef(selectedConversationId);

  useEffect(() => {
    if (!isConnected || !workspaceId) {
      return;
    }

    selectedIdRef.current = selectedConversationId;

    const unsubNewMsg = subscribe('message:new', (payload: Record<string, unknown>) => {
      refreshConversations();
      const { convId, messageId, newMsg } = parseInboxMessagePayload(payload);
      if (convId && convId === selectedIdRef.current && messageId) {
        const typedMsg: Message = { ...newMsg, id: messageId };
        setMessages((prev) => {
          if (prev.some((m) => m.id === messageId)) {
            return prev;
          }
          return [...prev, typedMsg];
        });
      }
    });

    const unsubConvUpdate = subscribe('conversation:update', () => {
      refreshConversations();
    });

    return () => {
      unsubNewMsg();
      unsubConvUpdate();
    };
  }, [
    isConnected,
    refreshConversations,
    selectedConversationId,
    setMessages,
    subscribe,
    workspaceId,
  ]);
}
