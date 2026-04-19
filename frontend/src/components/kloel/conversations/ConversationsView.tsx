'use client';

import { useConversationHistory } from '@/hooks/useConversationHistory';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { KLOEL_CHAT_ROUTE } from '@/lib/kloel-dashboard-context';
import { Plus, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { ConversationRow } from './ConversationRow';
import { ConversationsEmpty } from './ConversationsEmpty';
import { SelectionToolbar } from './SelectionToolbar';
import { DIVIDER, EMBER, F, M, MUTED, MUTED_2, SURFACE, TEXT, VOID } from './conversations-utils';

function useConversationSelection() {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggleSelection = useCallback((conversationId: string) => {
    setSelectedIds((current) =>
      current.includes(conversationId)
        ? current.filter((id) => id !== conversationId)
        : [...current, conversationId],
    );
  }, []);

  const resetSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds([]);
  }, []);

  return {
    selectionMode,
    setSelectionMode,
    selectedIds,
    setSelectedIds,
    toggleSelection,
    resetSelection,
  };
}

export function ConversationsView() {
  const { isMobile } = useResponsiveViewport();
  const router = useRouter();
  const { conversations, deleteConversation, setActiveConversation } = useConversationHistory();

  const [query, setQuery] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const {
    selectionMode,
    setSelectionMode,
    selectedIds,
    setSelectedIds,
    toggleSelection,
    resetSelection,
  } = useConversationSelection();

  const filteredConversations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return conversations;

    return conversations.filter((conversation) => {
      const title = String(conversation.title || '').toLowerCase();
      const preview = String(conversation.lastMessagePreview || '').toLowerCase();
      return title.includes(normalizedQuery) || preview.includes(normalizedQuery);
    });
  }, [conversations, query]);

  const openConversation = useCallback(
    (conversationId: string) => {
      setActiveConversation(conversationId);
      router.push(`${KLOEL_CHAT_ROUTE}?conversationId=${encodeURIComponent(conversationId)}`);
    },
    [router, setActiveConversation],
  );

  const deleteOne = useCallback(
    (conversationId: string) => {
      if (!window.confirm('Excluir esta conversa permanentemente?')) return;
      deleteConversation(conversationId);
      setSelectedIds((current) => current.filter((id) => id !== conversationId));
    },
    [deleteConversation, setSelectedIds],
  );

  const deleteSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    const approved = window.confirm(
      selectedIds.length === 1
        ? 'Excluir a conversa selecionada permanentemente?'
        : `Excluir ${selectedIds.length} conversas permanentemente?`,
    );
    if (!approved) return;

    selectedIds.forEach((conversationId) => {
      deleteConversation(conversationId);
    });
    resetSelection();
  }, [deleteConversation, resetSelection, selectedIds]);

  const handleHoverEnter = useCallback((id: string) => setHoveredId(id), []);
  const handleHoverLeave = useCallback(
    (id: string) => setHoveredId((current) => (current === id ? null : current)),
    [],
  );

  return (
    <div
      style={{
        minHeight: '100vh',
        background: VOID,
        color: TEXT,
        fontFamily: F,
      }}
    >
      <style>{`
        input::placeholder {
          color: ${MUTED_2};
        }
      `}</style>

      <div
        style={{
          maxWidth: 920,
          margin: '0 auto',
          padding: isMobile ? '24px 16px 28px' : '40px 24px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: isMobile ? 'stretch' : 'flex-end',
            flexDirection: isMobile ? 'column' : 'row',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h1
              style={{
                fontSize: 'clamp(30px, 5vw, 42px)',
                lineHeight: 1,
                fontWeight: 700,
                letterSpacing: '-0.04em',
                margin: 0,
              }}
            >
              Conversas
            </h1>
          </div>

          <button
            type="button"
            onClick={() => {
              setActiveConversation(null);
              router.push(KLOEL_CHAT_ROUTE);
            }}
            style={{
              height: 40,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              borderRadius: 6,
              border: `1px solid ${EMBER}`,
              background: 'transparent',
              color: TEXT,
              padding: isMobile ? '0 16px' : '0 14px',
              fontFamily: F,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              width: isMobile ? '100%' : 'auto',
              justifyContent: 'center',
            }}
          >
            <Plus size={16} color={EMBER} aria-hidden="true" />
            <span>Novo chat</span>
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: isMobile ? 'stretch' : 'center',
            flexDirection: isMobile ? 'column' : 'row',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              flex: '1 1 420px',
              minWidth: isMobile ? 0 : 280,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              height: 44,
              padding: '0 14px',
              borderRadius: 6,
              border: `1px solid ${DIVIDER}`,
              background: SURFACE,
            }}
          >
            <Search size={16} color={MUTED} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por título ou conteúdo da última mensagem"
              style={{
                flex: 1,
                minWidth: 0,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: TEXT,
                fontSize: 13,
                fontFamily: F,
              }}
            />
          </div>

          <button
            type="button"
            onClick={() => {
              if (selectionMode) {
                resetSelection();
                return;
              }
              setSelectionMode(true);
            }}
            style={{
              border: 'none',
              background: 'transparent',
              color: selectionMode ? TEXT : MUTED,
              fontFamily: F,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            {selectionMode ? 'Cancelar' : 'Selecionar'}
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <p
            style={{
              margin: 0,
              color: MUTED,
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            Suas conversas com a Kloel IA
          </p>
          <span
            style={{
              color: MUTED_2,
              fontFamily: M,
              fontSize: 11,
              letterSpacing: '0.04em',
            }}
          >
            {filteredConversations.length} conversa{filteredConversations.length === 1 ? '' : 's'}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            minHeight: 360,
          }}
        >
          {filteredConversations.length > 0 ? (
            filteredConversations.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                isMobile={isMobile}
                isSelected={selectedIds.includes(conversation.id)}
                isHovered={hoveredId === conversation.id}
                selectionMode={selectionMode}
                onHoverEnter={handleHoverEnter}
                onHoverLeave={handleHoverLeave}
                onToggleSelect={toggleSelection}
                onOpen={openConversation}
                onDelete={deleteOne}
              />
            ))
          ) : (
            <ConversationsEmpty hasQuery={query.trim().length > 0} />
          )}
        </div>

        {selectionMode && selectedIds.length > 0 && (
          <SelectionToolbar
            count={selectedIds.length}
            onDelete={deleteSelected}
            onCancel={resetSelection}
          />
        )}
      </div>
    </div>
  );
}

export default ConversationsView;
