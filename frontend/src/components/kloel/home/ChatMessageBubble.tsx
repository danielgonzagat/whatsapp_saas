import { kloelT } from '@/lib/i18n/t';
import { KloelMushroomVisual } from '@/components/kloel/KloelBrand';
import { colors } from '@/lib/design-tokens';
import type { ChatMessage } from './HomeScreen.types';
import { CopyIcon, CopiedIcon, EditIcon } from './MessageActionIcons';

const PATTERN_RE = /(\*\*[^*]+\*\*)/g;

function renderMessageText(text: string) {
  const parts = text.split(PATTERN_RE);
  let cumulative = '';
  return parts.map((part) => {
    cumulative += `|${part}`;
    const key = cumulative;
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={key} style={{ color: colors.ember.primary, fontWeight: 600 }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={key}>{part}</span>;
  });
}

interface MessageActionButtonProps {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  isActive?: boolean;
  activeIcon?: React.ReactNode;
  activeLabel?: string;
}

function MessageActionButton({
  onClick,
  icon,
  label,
  isActive,
  activeIcon,
  activeLabel,
}: MessageActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--app-text-tertiary)',
        fontSize: 11,
        fontFamily: "'Sora', sans-serif",
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        padding: '2px 6px',
        borderRadius: 4,
        transition: 'color 150ms ease',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.color = colors.text.muted;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.color = colors.text.dim;
      }}
    >
      {isActive && activeIcon ? activeIcon : icon}
      {isActive && activeLabel ? activeLabel : label}
    </button>
  );
}

function UserMessage({
  msg,
  copiedId,
  onCopy,
  onEdit,
}: {
  msg: ChatMessage;
  copiedId: string | null;
  onCopy: (id: string, content: string) => void;
  onEdit: (content: string) => void;
}) {
  const isCopied = copiedId === msg.id;

  return (
    <div
      className="kloel-msg-user"
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'flex-end',
        gap: 6,
        animation: 'fadeIn 0.4s ease-out forwards',
      }}
    >
      <div
        className="kloel-msg-actions"
        style={{
          display: 'flex',
          gap: 2,
          opacity: 0,
          transition: 'opacity 150ms ease',
          flexShrink: 0,
        }}
      >
        <MessageActionButton
          onClick={() => onCopy(msg.id, msg.content)}
          icon={<CopyIcon />}
          label={kloelT(`Copiar`)}
          isActive={isCopied}
          activeIcon={<CopiedIcon />}
          activeLabel="Copiado"
        />
        <MessageActionButton
          onClick={() => onEdit(msg.content)}
          icon={<EditIcon />}
          label={kloelT(`Editar`)}
        />
      </div>
      <div
        style={{
          background: colors.checkout.surface,
          color: 'var(--app-text-primary)',
          borderRadius: 20,
          padding: '12px 18px',
          maxWidth: '75%',
          fontFamily: "'Sora', sans-serif",
          fontSize: 14,
          lineHeight: 1.6,
          fontWeight: 400,
        }}
      >
        {msg.content}
      </div>
    </div>
  );
}

function AssistantMessage({
  msg,
  thinkingText,
  copiedId,
  onCopy,
  errorMessage,
}: {
  msg: ChatMessage;
  thinkingText: string;
  copiedId: string | null;
  onCopy: (id: string, content: string) => void;
  errorMessage: string;
}) {
  const isCopied = copiedId === msg.id;

  return (
    <div
      className="kloel-msg-assistant"
      style={{
        maxWidth: '85%',
        animation: 'fadeIn 0.4s ease-out forwards',
      }}
    >
      {msg.isThinking && (
        <div
          style={{
            animation: 'thinkPulse 2s ease-in-out infinite',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 13,
              color: 'var(--app-text-tertiary)',
              opacity: 0.6,
              fontFamily: "'Sora', sans-serif",
              fontStyle: 'italic',
            }}
          >
            {thinkingText}
          </span>
          <KloelMushroomVisual
            size={28}
            traceColor={colors.text.silver}
            animated
            spores="animated"
            ariaHidden
          />
        </div>
      )}

      {!msg.isThinking && (
        <div
          style={{
            fontFamily: "'Sora', sans-serif",
            fontSize: 14,
            lineHeight: 1.8,
            color: msg.content === errorMessage ? colors.text.dim : colors.text.silver,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {renderMessageText(msg.displayedContent ?? msg.content)}
          {msg.isTyping && (
            <span
              style={{
                color: colors.ember.primary,
                fontWeight: 400,
                animation: 'blink 1s ease-in-out infinite',
                textShadow: '0 0 8px rgba(232, 93, 48, 0.5)',
                marginLeft: 1,
              }}
            >
              |
            </span>
          )}
        </div>
      )}

      {!msg.isThinking &&
        !msg.isTyping &&
        msg.content &&
        msg.content !== errorMessage && (
          <div
            className="kloel-msg-actions"
            style={{
              opacity: 0,
              transition: 'opacity 150ms ease',
              marginTop: 6,
            }}
          >
            <MessageActionButton
              onClick={() => onCopy(msg.id, msg.content)}
              icon={<CopyIcon />}
              label={kloelT(`Copiar`)}
              isActive={isCopied}
              activeIcon={<CopiedIcon />}
              activeLabel="Copiado"
            />
          </div>
        )}
    </div>
  );
}

interface ChatMessageBubbleProps {
  msg: ChatMessage;
  thinkingText: string;
  copiedId: string | null;
  onCopy: (id: string, content: string) => void;
  onEdit: (content: string) => void;
  errorMessage: string;
}

export function ChatMessageBubble({
  msg,
  thinkingText,
  copiedId,
  onCopy,
  onEdit,
  errorMessage,
}: ChatMessageBubbleProps) {
  if (msg.role === 'user') {
    return (
      <UserMessage msg={msg} copiedId={copiedId} onCopy={onCopy} onEdit={onEdit} />
    );
  }

  return (
    <AssistantMessage
      msg={msg}
      thinkingText={thinkingText}
      copiedId={copiedId}
      onCopy={onCopy}
      errorMessage={errorMessage}
    />
  );
}
