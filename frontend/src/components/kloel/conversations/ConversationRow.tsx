'use client';

import { ArrowUpRight, CheckSquare2, Square, Trash2 } from 'lucide-react';
import { ConversationsIcon } from '../sidebar/ConversationsIcon';
import {
  DIVIDER,
  EMBER,
  F,
  M,
  MUTED,
  MUTED_2,
  SURFACE,
  SURFACE_HOVER,
  TEXT,
  formatRelativeTime,
} from './conversations-utils';

interface ConversationLike {
  id: string;
  title?: string;
  updatedAt?: string;
  lastMessagePreview?: string;
}

interface ConversationRowProps {
  conversation: ConversationLike;
  isMobile: boolean;
  isSelected: boolean;
  isHovered: boolean;
  selectionMode: boolean;
  onHoverEnter: (id: string) => void;
  onHoverLeave: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

function LeadingIcon({
  selectionMode,
  isSelected,
  isHovered,
}: {
  selectionMode: boolean;
  isSelected: boolean;
  isHovered: boolean;
}) {
  if (selectionMode) {
    return isSelected ? (
      <CheckSquare2 size={18} aria-hidden="true" />
    ) : (
      <Square size={18} aria-hidden="true" />
    );
  }
  return <ConversationsIcon size={18} color={isHovered ? TEXT : MUTED} aria-hidden />;
}

function RowActions({
  conversationId,
  isHovered,
  onOpen,
  onDelete,
}: {
  conversationId: string;
  isHovered: boolean;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
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
        type="button"
        onClick={() => onOpen(conversationId)}
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
        <ArrowUpRight size={15} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onDelete(conversationId)}
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
        <Trash2 size={15} aria-hidden="true" />
      </button>
    </div>
  );
}

export function ConversationRow({
  conversation,
  isMobile,
  isSelected,
  isHovered,
  selectionMode,
  onHoverEnter,
  onHoverLeave,
  onToggleSelect,
  onOpen,
  onDelete,
}: ConversationRowProps) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: conversation row groups block-level content (avatar + text + actions); role="group" is the correct ARIA mapping
    <div
      role="group"
      onMouseEnter={() => onHoverEnter(conversation.id)}
      onMouseLeave={() => onHoverLeave(conversation.id)}
      style={{
        display: 'flex',
        alignItems: isMobile ? 'flex-start' : 'center',
        flexDirection: isMobile ? 'column' : 'row',
        gap: 14,
        minHeight: 78,
        padding: '16px 14px',
        borderRadius: 6,
        background: isSelected ? 'rgba(232,93,48,0.08)' : isHovered ? SURFACE_HOVER : 'transparent',
        border: `1px solid ${isSelected ? 'rgba(232,93,48,0.28)' : 'transparent'}`,
        transition: 'background 150ms ease, border-color 150ms ease',
      }}
    >
      <button
        type="button"
        onClick={() => (selectionMode ? onToggleSelect(conversation.id) : onOpen(conversation.id))}
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
          <LeadingIcon
            selectionMode={selectionMode}
            isSelected={isSelected}
            isHovered={isHovered}
          />
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
              fontFamily: F,
            }}
          >
            {conversation.lastMessagePreview || 'Sem prévia disponível para esta conversa.'}
          </p>
        </div>
      </button>

      {!selectionMode && (
        <RowActions
          conversationId={conversation.id}
          isHovered={isHovered}
          onOpen={onOpen}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}
