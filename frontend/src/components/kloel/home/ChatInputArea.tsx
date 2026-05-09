import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';

function SendIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function PaperclipIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path
        d={kloelT(
          `M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48`,
        )}
      />
    </svg>
  );
}

interface ChatInputAreaProps {
  value: string;
  onChange: (value: string) => void;
  isWaitingForResponse: boolean;
  onSubmit: () => void;
  onStop: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

export function ChatInputArea({
  value,
  onChange,
  isWaitingForResponse,
  onSubmit,
  onStop,
  inputRef,
}: ChatInputAreaProps) {
  return (
    <div
      style={{
        borderTop: '1px solid var(--app-border-subtle)',
        padding: '0 20px',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          maxWidth: 660,
          margin: '0 auto',
          padding: '12px 0 16px',
        }}
      >
        <form
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            padding: '10px 12px',
            transition: 'border-color 150ms ease, box-shadow 150ms ease',
          }}
          onFocus={(e) => {
            const el = e.currentTarget;
            el.style.borderColor = 'rgba(232, 93, 48, 0.4)';
            el.style.boxShadow = '0 0 0 2px rgba(232, 93, 48, 0.08)';
          }}
          onBlur={(e) => {
            const el = e.currentTarget;
            el.style.borderColor = colors.border.space;
            el.style.boxShadow = 'none';
          }}
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <button
            type="button"
            style={{
              background: 'none',
              border: 'none',
              padding: 4,
              cursor: 'pointer',
              color: 'var(--app-text-tertiary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 150ms ease',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = colors.text.muted;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = colors.text.dim;
            }}
          >
            <PaperclipIcon size={16} />
          </button>

          <input
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
            placeholder={kloelT(`Escreva sua mensagem...`)}
            disabled={isWaitingForResponse}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              color: 'var(--app-text-primary)',
              fontSize: 14,
              fontFamily: "'Sora', sans-serif",
              opacity: isWaitingForResponse ? 0.5 : 1,
            }}
          />

          {isWaitingForResponse ? (
            <button
              type="button"
              onClick={onStop}
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: 'rgba(232, 93, 48, 0.08)',
                border: '1px solid rgba(232, 93, 48, 0.3)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: colors.ember.primary,
                transition: 'all 150ms ease',
                flexShrink: 0,
              }}
              title={kloelT(`Parar resposta`)}
            >
              <svg
                aria-hidden="true"
                width={10}
                height={10}
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <rect x="4" y="4" width="16" height="16" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              onClick={onSubmit}
              disabled={!value.trim()}
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: value.trim() ? colors.ember.primary : 'transparent',
                border: value.trim() ? 'none' : `1px solid ${colors.border.space}`,
                cursor: value.trim() ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: value.trim() ? colors.background.void : colors.text.dim,
                transition: 'all 150ms ease',
                flexShrink: 0,
              }}
            >
              <SendIcon size={12} />
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
