'use client';

import type React from 'react';

import { KLOEL_THEME } from '@/lib/kloel-theme';
import { ArrowUp } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface InputComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (content: string) => void;
  onConnectWhatsApp: () => void;
  showActionButtons: boolean;
}

export function InputComposer({ value, onChange, onSend }: InputComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 192)}px`;
  }, [value]);

  const handleSubmit = () => {
    if (value.trim()) {
      onSend(value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{
          position: 'relative',
          borderRadius: 6,
          border: '1px solid var(--app-border-primary)',
          background: 'var(--app-bg-card)',
          boxShadow: 'none',
          transition: 'border-color 150ms ease',
        }}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Pergunte qualquer coisa sobre vendas, marketing ou WhatsApp..."
          style={{
            width: '100%',
            minHeight: 56,
            maxHeight: 192,
            resize: 'none',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            padding: '16px 56px 16px 16px',
            color: 'var(--app-text-primary)',
            fontSize: 14,
            fontFamily: "'Sora', sans-serif",
            lineHeight: 1.5,
          }}
          rows={1}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = 'auto';
            target.style.height = `${Math.min(target.scrollHeight, 192)}px`;
          }}
        />

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!value.trim()}
          style={{
            position: 'absolute',
            bottom: 12,
            right: 12,
            width: 32,
            height: 32,
            borderRadius: 6,
            border: 'none',
            background: value.trim() ? KLOEL_THEME.accent : KLOEL_THEME.bgTertiary,
            color: value.trim() ? KLOEL_THEME.textOnAccent : KLOEL_THEME.textTertiary,
            cursor: value.trim() ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 150ms ease',
          }}
        >
          <ArrowUp style={{ width: 16, height: 16 }} />
        </button>
      </div>
    </div>
  );
}
