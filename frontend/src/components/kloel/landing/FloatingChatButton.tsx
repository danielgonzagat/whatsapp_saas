'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';

interface FloatingChatButtonProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function FloatingChatButton({ isOpen, onToggle }: FloatingChatButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        position: 'fixed',
        bottom: 24,
        right: 'clamp(12px, 2vw, 24px)',
        width: 48,
        height: 48,
        borderRadius: 6,
        background: colors.ember.primary,
        border: 'none',
        cursor: 'pointer',
        boxShadow: '0 4px 20px rgba(232,93,48,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        transition: 'opacity 150ms ease',
      }}
    >
      {isOpen ? (
        <svg
          width={20}
          height={20}
          viewBox="0 0 24 24"
          fill="none"
          stroke="colors.background.void"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      ) : (
        <svg
          width={22}
          height={22}
          viewBox="0 0 24 24"
          fill="none"
          stroke="colors.background.void"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d={kloelT(`M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z`)} />
        </svg>
      )}
    </button>
  );
}
