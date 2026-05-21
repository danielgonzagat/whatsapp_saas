'use client';

import { colors } from '@/lib/design-tokens';

interface FloatingChatHeaderProps {
  onClose: () => void;
}

export function FloatingChatHeader({ onClose }: FloatingChatHeaderProps) {
  return (
    <div
      style={{
        height: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        padding: '0 8px',
        flexShrink: 0,
      }}
    >
      <button
        type="button"
        onClick={onClose}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: colors.text.dim,
          padding: 4,
          display: 'flex',
          alignItems: 'center',
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
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
