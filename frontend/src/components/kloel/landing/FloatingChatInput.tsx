'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import type { RefObject } from 'react';

const S = "var(--font-sora), 'Sora', sans-serif";

interface FloatingChatInputProps {
  inputRef: RefObject<HTMLInputElement | null>;
  input: string;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: () => void;
  isStreaming: boolean;
}

export function FloatingChatInput({
  inputRef,
  input,
  onInputChange,
  onSubmit,
  isStreaming,
}: FloatingChatInputProps) {
  return (
    <div
      style={{
        padding: 12,
        borderTop: `1px solid ${colors.background.elevated}`,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: colors.background.surface,
          border: `1px solid ${colors.border.space}`,
          borderRadius: 6,
          padding: '8px 12px',
        }}
      >
        <input
          ref={inputRef}
          value={input}
          onChange={onInputChange}
          onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
          placeholder={kloelT(`Digite sua mensagem...`)}
          style={{
            flex: 1,
            background: 'none',
            border: 'none',
            outline: 'none',
            color: colors.text.silver,
            fontSize: 16,
            fontFamily: S,
          }}
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={!input.trim() || isStreaming}
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            background: input.trim() ? colors.ember.primary : colors.background.elevated,
            border: 'none',
            cursor: input.trim() ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: input.trim() ? colors.background.void : colors.text.dim,
            transition: 'all 150ms ease',
            flexShrink: 0,
          }}
        >
          <svg
            aria-hidden="true"
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
