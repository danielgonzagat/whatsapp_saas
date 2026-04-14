'use client';

import { useConversationHistory } from '@/hooks/useConversationHistory';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { KLOEL_CHAT_ROUTE } from '@/lib/kloel-dashboard-context';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { ArrowUpRight, CheckSquare2, Plus, Search, Square, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ConversationsIcon } from '../sidebar/ConversationsIcon';

const SURFACE = KLOEL_THEME.bgCard;
const SURFACE_HOVER = KLOEL_THEME.bgHover;
const DIVIDER = KLOEL_THEME.borderSubtle;
const MUTED = KLOEL_THEME.textSecondary;
const MUTED_2 = KLOEL_THEME.textTertiary;
const TEXT = KLOEL_THEME.textPrimary;
const EMBER = KLOEL_THEME.accent;
const VOID = KLOEL_THEME.bgPrimary;
const F = "'Sora', sans-serif";
const M = "'JetBrains Mono', monospace";

function formatRelativeTime(value?: string) {
  if (!value) return 'Última mensagem agora';

  const diffMs = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'Última mensagem agora';

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Última mensagem agora';
  if (minutes < 60) return `Última mensagem há ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Última mensagem há ${hours} h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `Última mensagem há ${days} d`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `Última mensagem há ${weeks} sem`;

  const months = Math.floor(days / 30);
  if (months < 12) return `Última mensagem há ${months} mês${months > 1 ? 'es' : ''}`;

  const years = Math.floor(days / 365);
  return `Última mensagem há ${years} ano${years > 1 ? 's' : ''}`;
}

export function ConversationsView() {
  const { isMobile } = useResponsiveViewport();
  const router = useRouter();
  const { conversations, deleteConversation, setActiveConversation } = useConversationHistory();

  const [query, setQuery] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const filteredConversations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return conversations;

    return conversations.filter((conversation) => {
      const title = String(conversation.title || '').toLowerCase();
      const preview = String(conversation.lastMessagePreview || '').toLowerCase();
      return title.includes(normalizedQuery) || preview.includes(normalizedQuery);
    });
  }, [conversations, query]);

  const openConversation = (conversationId: string) => {
    setActiveConversation(conversationId);
    router.push(`${KLOEL_CHAT_ROUTE}?conversationId=${encodeURIComponent(conversationId)}`);
  };

  const toggleSelection = (conversationId: string) => {
    setSelectedIds((current) =>
      current.includes(conversationId)
        ? current.filter((id) => id !== conversationId)
        : [...current, conversationId],
    );
  };

  const resetSelection = () => {
    setSelectionMode(false);
    setSelectedIds([]);
  };

  const deleteOne = (conversationId: string) => {
    if (!window.confirm('Excluir esta conversa permanentemente?')) return;
    deleteConversation(conversationId);
    setSelectedIds((current) => current.filter((id) => id !== conversationId));
  };

  const deleteSelected = () => {
    if (selectedIds.length === 0) return;
    const approved = window.confirm(
      selectedIds.length === 1
        ? 'Excluir a conversa selecionada permanentemente?'
        : `Excluir ${selectedIds.length} conversas permanentemente?`,
    );
    if (!approved) return;

    selectedIds.forEach((conversationId) => deleteConversation(conversationId));
    resetSelection();
  };

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
            <Plus size={16} color={EMBER} />
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
            <Search size={16} color={MUTED} />
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
            filteredConversations.map((conversation) => {
              const isSelected = selectedIds.includes(conversation.id);
              const isHovered = hoveredId === conversation.id;

              return (
                <div
                  key={conversation.id}
                  onMouseEnter={() => setHoveredId(conversation.id)}
                  onMouseLeave={() =>
                    setHoveredId((current) => (current === conversation.id ? null : current))
                  }
                  style={{
                    display: 'flex',
                    alignItems: isMobile ? 'flex-start' : 'center',
                    flexDirection: isMobile ? 'column' : 'row',
                    gap: 14,
                    minHeight: 78,
                    padding: '16px 14px',
                    borderRadius: 6,
                    background: isSelected
                      ? 'rgba(232,93,48,0.08)'
                      : isHovered
                        ? SURFACE_HOVER
                        : 'transparent',
                    border: `1px solid ${isSelected ? 'rgba(232,93,48,0.28)' : 'transparent'}`,
                    transition: 'background 150ms ease, border-color 150ms ease',
                  }}
                >
                  <button
                    onClick={() =>
                      selectionMode
                        ? toggleSelection(conversation.id)
                        : openConversation(conversation.id)
                    }
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      flex: 1,
                      minWidth: 0,
                      border: 'none',
                      background: 'transparent',
                      padding: 0,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div
                      style={{
                        width: 22,
                        display: 'flex',
                        justifyContent: 'center',
                        flexShrink: 0,
                        color: isSelected ? EMBER : MUTED,
                      }}
                    >
                      {selectionMode ? (
                        isSelected ? (
                          <CheckSquare2 size={18} />
                        ) : (
                          <Square size={18} />
                        )
                      ) : (
                        <ConversationsIcon size={18} color={isHovered ? TEXT : MUTED} aria-hidden />
                      )}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: isMobile ? 'flex-start' : 'center',
                          justifyContent: 'space-between',
                          flexDirection: isMobile ? 'column' : 'row',
                          gap: 16,
                          marginBottom: 6,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            color: TEXT,
                            whiteSpace: isMobile ? 'normal' : 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {conversation.title}
                        </span>
                        <span
                          style={{
                            flexShrink: 0,
                            fontSize: 10,
                            color: MUTED_2,
                            fontFamily: M,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {formatRelativeTime(conversation.updatedAt)}
                        </span>
                      </div>

                      <p
                        style={{
                          margin: 0,
                          color: MUTED,
                          fontSize: 12,
                          lineHeight: 1.55,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {conversation.lastMessagePreview ||
                          'Sem prévia disponível para esta conversa.'}
                      </p>
                    </div>
                  </button>

                  {!selectionMode && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        opacity: isHovered ? 1 : 0,
                        pointerEvents: isHovered ? 'auto' : 'none',
                        transition: 'opacity 150ms ease',
                        flexShrink: 0,
                      }}
                    >
                      <button
                        onClick={() => openConversation(conversation.id)}
                        title="Abrir conversa"
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 6,
                          border: `1px solid ${DIVIDER}`,
                          background: SURFACE,
                          color: MUTED,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        <ArrowUpRight size={15} />
                      </button>
                      <button
                        onClick={() => deleteOne(conversation.id)}
                        title="Excluir conversa"
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 6,
                          border: `1px solid rgba(232,93,48,0.16)`,
                          background: 'rgba(232,93,48,0.08)',
                          color: EMBER,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div
              style={{
                minHeight: 320,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16,
                textAlign: 'center',
                borderRadius: 6,
                border: `1px dashed ${DIVIDER}`,
                background: KLOEL_THEME.bgSecondary,
                padding: '32px 24px',
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 6,
                  background: SURFACE,
                  border: `1px solid ${DIVIDER}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ConversationsIcon size={20} color={TEXT} aria-hidden />
              </div>
              <div style={{ maxWidth: 420 }}>
                <h2
                  style={{
                    margin: '0 0 8px',
                    fontSize: 18,
                    fontWeight: 600,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {query.trim()
                    ? 'Nenhuma conversa encontrada'
                    : 'Nenhuma conversa registrada ainda'}
                </h2>
                <p
                  style={{
                    margin: 0,
                    color: MUTED,
                    fontSize: 13,
                    lineHeight: 1.6,
                  }}
                >
                  {query.trim()
                    ? 'Refine a busca ou abra um novo chat para começar outra thread.'
                    : 'Abra um novo chat para iniciar a primeira thread e o histórico aparecerá aqui.'}
                </p>
              </div>
            </div>
          )}
        </div>

        {selectionMode && selectedIds.length > 0 && (
          <div
            style={{
              position: 'sticky',
              bottom: 24,
              alignSelf: 'center',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 12px',
              borderRadius: 6,
              border: `1px solid ${DIVIDER}`,
              background: 'color-mix(in srgb, var(--app-bg-card) 96%, transparent)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <span
              style={{
                color: TEXT,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {selectedIds.length} selecionada{selectedIds.length > 1 ? 's' : ''}
            </span>
            <button
              onClick={deleteSelected}
              style={{
                height: 34,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                borderRadius: 6,
                border: `1px solid rgba(232,93,48,0.18)`,
                background: 'rgba(232,93,48,0.08)',
                color: EMBER,
                padding: '0 12px',
                fontFamily: F,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Trash2 size={14} />
              Excluir
            </button>
            <button
              onClick={resetSelection}
              title="Cancelar seleção"
              style={{
                width: 34,
                height: 34,
                borderRadius: 6,
                border: `1px solid ${DIVIDER}`,
                background: SURFACE,
                color: MUTED,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ConversationsView;
